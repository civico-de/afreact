import { useQuery } from "@tanstack/react-query";
import { useContext, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { api4, errorMessage } from "../../api/civi";
import { BuilderPanels, pluginsReady, pluginVerdict } from "../BuilderPanels";
import { ClassicContext } from "../classic";
import { ClassicOnly } from "../ClassicOnly";
import { classicOnlyChanges } from "../foreign";
import { isDirty, useHistory } from "../history";
import { usePageLoaded } from "../pageLoaded";
import { usePageHeading } from "../pageHeading";
import { useLeaveGuard } from "../route";
import { tabClick } from "../widgets/Tabs";
import { CanvasRoot, Container } from "./canvas/Container";
import { applyOpenRichText, ButtonElement, MarkupElement, TextElement } from "./canvas/Content";
import { CanvasDnd } from "./canvas/dnd";
import { GenericElement, SearchDisplayElement } from "./canvas/Embedded";
import { FieldElement } from "./canvas/Field";
import { RenderContext, type RenderElement } from "./canvas/common";
import { TabsetElement } from "./canvas/Tabset";
import { saveAfform } from "./save";
import { blockEntity, canvasNodes, EditorContext, formEntities, type EditorApi } from "./context";
import { useMarkup } from "./Markup";
import {
  addMeta,
  displayKey,
  initialMeta,
  type AdminData,
  type AfformDefinition,
  type EditorMeta,
} from "./meta";
import {
  addEntity,
  backfillEntities,
  canvasPath,
  initialForm,
  removeEntity,
  savePayload,
  updateCanvas,
  type EditorMode,
} from "./model";
import { searchDisplaysOnForm, withBlockActions } from "./nodes";
import { Palette, scrollToEntity, type SearchOption } from "./palette/Palette";
import { settingsProblems } from "./palette/SettingsTab";
import type { ShallowNode } from "./tree";
import { crmAlert } from "../../html";

export type FormRoute =
  | { mode: "create"; type: string; entity: string }
  | { mode: "edit" | "clone"; name: string };

async function loadForm(route: FormRoute): Promise<AdminData> {
  // Core returns no definition for a name no form has.
  const [data] = await api4<
    Omit<AdminData, "definition"> & { definition: AfformDefinition | null }
  >(
    "Afform",
    "loadAdminData",
    route.mode === "create"
      ? { definition: { type: route.type }, entity: route.entity }
      : { definition: { name: route.name } },
  );
  if (!data) throw new Error("Afform.loadAdminData returned nothing.");
  const { definition } = data;
  if (!definition)
    throw new Error(
      route.mode === "create"
        ? "Afform.loadAdminData returned no definition."
        : ts("There is no form named %1.", { 1: route.name }),
    );
  return { ...data, definition };
}

/** Why a loaded form cannot be drawn, such as a form without af-form, on which core's editor breaks. */
function unusable(data: AdminData, route: FormRoute): string | null {
  if (route.mode === "create") return null;
  try {
    canvasPath(data.definition);
    return null;
  } catch (error: unknown) {
    return errorMessage(error);
  }
}

/** The layout as the editor holds it: entities backfilled, joins and blocks with their actions. */
export function withLayout(
  afform: AfformDefinition,
  layout: ShallowNode[],
  meta: EditorMeta,
): AfformDefinition {
  let next: AfformDefinition = { ...afform, layout };
  if (next.type === "form") next = backfillEntities(next);
  return updateCanvas(next, (children) => withBlockActions(children, meta));
}

/** editor.getLink(): where the saved form is shown. */
export const formLink = (afform: AfformDefinition): string | null =>
  afform.server_route
    ? window.CRM.url(afform.server_route, undefined, afform.is_public ? "front" : "back")
    : null;

/** Whether a save changed what the admin menu shows. */
function menuChanged(saved: AfformDefinition, sent: AfformDefinition): boolean {
  const navigation = JSON.stringify(sent.navigation ?? null);
  if (navigation !== JSON.stringify(saved.navigation ?? null)) return true;
  return (
    !!sent.navigation &&
    ((sent.server_route ?? "") !== (saved.server_route ?? "") || sent.icon !== saved.icon)
  );
}

function refreshMenubar() {
  const menubar = window.CRM.menubar;
  if (!menubar) return;
  menubar.destroy();
  menubar.cacheCode = Math.random();
  menubar.initialize();
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

const render: RenderElement = (type, props) => {
  switch (type) {
    case "field":
      return <FieldElement {...props} />;
    case "fieldset":
    case "searchFieldset":
    case "join":
    case "container":
      return <Container type={type} {...props} />;
    case "tabset":
      return <TabsetElement {...props} />;
    case "searchDisplay":
      return <SearchDisplayElement {...props} />;
    case "generic":
      return <GenericElement {...props} />;
    case "text":
      return <TextElement {...props} />;
    case "button":
      return <ButtonElement {...props} />;
    default:
      return <MarkupElement {...props} />;
  }
};

/** afGuiEditor: FormBuilder's editor for a form, block or search form. */
export function FormEditor(route: FormRoute) {
  const pageLoaded = usePageLoaded();
  const loaded = useQuery({
    queryKey: ["Afform", "editor", route],
    queryFn: () => loadForm(route),
    gcTime: 0,
    staleTime: Infinity,
  });
  if (loaded.error)
    return (
      <p className="crm-error" role="alert">
        {errorMessage(loaded.error)}
      </p>
    );
  if (!loaded.data || !pageLoaded) return <p role="status">{ts("Loading…")}</p>;
  const refusal = unusable(loaded.data, route);
  if (refusal)
    return (
      <p className="crm-error" role="alert">
        {refusal}
      </p>
    );
  return (
    <Editor
      data={loaded.data}
      mode={route.mode}
      entity={route.mode === "create" ? route.entity : undefined}
    />
  );
}

function initialState(data: AdminData, mode: EditorMode, entity: string | undefined) {
  const meta = initialMeta(data);
  const afform = initialForm(data, meta, mode, entity);
  return { meta, afform: withLayout(afform, afform.layout, meta) };
}

function Editor({
  data,
  mode,
  entity,
}: {
  data: AdminData;
  mode: EditorMode;
  entity: string | undefined;
}) {
  const [initial] = useState(() => initialState(data, mode, entity));
  const [meta, setMeta] = useState(initial.meta);
  const latestMeta = useRef(meta);
  // deviation:opened-form-saved
  const [history, dispatch] = useHistory(initial.afform);
  const afform = history.present;
  const [selected, select] = useState<string | null>(null);
  // Each state keeps the palette tab selected when it was made; undo and redo select it again.
  const selections = useRef(new WeakMap<AfformDefinition, string | null>());
  const remember = useEffectEvent((state: AfformDefinition) => {
    if (!selections.current.has(state)) selections.current.set(state, selected);
  });
  useEffect(() => {
    remember(afform);
  }, [afform]);
  const [saving, setSaving] = useState(false);
  const [saveAsked, setSaveAsked] = useState(0);
  const [dialog, setDialog] = useState<ReactNode>(null);
  const [loading, setLoading] = useState<string[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const changed = isDirty(history);
  const dirty = changed || !afform.name;

  const latestAfform = useRef(afform);
  useEffect(() => {
    latestMeta.current = meta;
    latestAfform.current = afform;
  }, [meta, afform]);

  const mergeMeta = (loadedData: AdminData) => {
    const next = addMeta(latestMeta.current, loadedData);
    latestMeta.current = next;
    setMeta(next);
    return next;
  };

  const change = (update: (state: AfformDefinition) => AfformDefinition) => {
    dispatch({ type: "change", update });
  };
  const markup = useMarkup(afform, (layout) => {
    change((state) => withLayout(state, layout, latestMeta.current));
  });
  useLeaveGuard(changed || markup.unapplied);

  const entities = formEntities(afform, meta);
  const displays = afform.type === "search" ? searchDisplaysOnForm(afform, meta) : [];
  const valid =
    selected === null ||
    selected === "extra" ||
    entities.some((each) => each.name === selected) ||
    displays.some((display) => display.key === selected && meta.searchDisplays[display.key]);
  const shownSelection = valid ? selected : null;

  // Entities and displays the markup brought in arrive without their metadata.
  // deviation:markup-entities-load-meta
  const missing = [
    ...entities
      .filter((each) => each.path !== null && !meta.gui.entities[each.type]?.fields)
      .map((each) => `form:${each.type}`),
    ...displays
      .filter((display) => !meta.searchDisplays[display.key])
      .map((display) => `search:${display.key}`),
  ].filter((key) => !loading.includes(key) && !failed.includes(key));
  const missingKey = [...new Set(missing)].join("\n");
  const loadMissing = useEffectEvent((keys: string[]) => {
    setLoading((current) => [...current, ...keys]);
    for (const key of keys) {
      const [type = "", name = ""] = key.split(/:(.*)/s);
      api4<AdminData>("Afform", "loadAdminData", { definition: { type }, entity: name })
        .then(([result]) => {
          if (!result) throw new Error("Afform.loadAdminData returned nothing.");
          mergeMeta(result);
        })
        .catch((failure: unknown) => {
          setFailed((current) => [...current, key]);
          crmAlert(errorMessage(failure), ts("Error"), "error");
        })
        .finally(() => {
          setLoading((current) => current.filter((each) => each !== key));
        });
    }
  });
  useEffect(() => {
    if (missingKey) loadMissing(missingKey.split("\n"));
  }, [missingKey]);

  const withLoading = (key: string, work: () => Promise<void>) => {
    setLoading((current) => [...current, key]);
    work()
      .catch((failure: unknown) => {
        crmAlert(errorMessage(failure), ts("Error"), "error");
      })
      .finally(() => {
        setLoading((current) => current.filter((each) => each !== key));
      });
  };

  /** editor.addEntity(): the entity's fields loaded first, then the entity added and shown. */
  const onAddEntity = (type: string) => {
    const add = (withMeta: EditorMeta) => {
      const added = addEntity(latestAfform.current, withMeta, type);
      // Taken at once, so an add before the next render names and selects the next entity.
      latestAfform.current = added.afform;
      const { name } = added;
      change((state) => addEntity(state, withMeta, type).afform);
      select(name);
      requestAnimationFrame(() => {
        scrollToEntity(name);
      });
    };
    if (meta.gui.entities[type]?.fields) {
      add(meta);
      return;
    }
    withLoading(`form:${type}`, async () => {
      const [result] = await api4<AdminData>("Afform", "loadAdminData", {
        definition: { type: "form" },
        entity: type,
      });
      if (!result) throw new Error("Afform.loadAdminData returned nothing.");
      add(mergeMeta(result));
    });
  };

  /** editor.addSearchDisplay(): a search fieldset with the display, its settings loaded first. */
  const onAddSearch = (option: SearchOption) => {
    const [searchName = "", displayName = ""] = option.key.split(".");
    const add = () => {
      const fieldset: ShallowNode = {
        "#tag": "div",
        "af-fieldset": "",
        "af-title": option.label,
        "#children": [
          { "#tag": option.tag, "search-name": searchName, "display-name": displayName },
        ],
      };
      change((state) => updateCanvas(state, (children) => [...children, fieldset]));
      select(displayKey(searchName, displayName));
    };
    if (meta.searchDisplays[displayKey(searchName, displayName)]) {
      add();
      return;
    }
    withLoading(`search:${option.key}`, async () => {
      const [result] = await api4<AdminData>("Afform", "loadAdminData", {
        definition: { type: "search" },
        entity: option.key,
      });
      if (!result) throw new Error("Afform.loadAdminData returned nothing.");
      mergeMeta(result);
      add();
    });
  };

  // deviation:undo-field-menu-toggle
  // Undo and redo only move in the history; the redrawn canvas records no step of its own.
  const travel = (target: AfformDefinition | undefined, action: "undo" | "redo") => {
    dispatch({ type: action });
    const tab = target && selections.current.get(target);
    if (tab !== undefined) select(tab);
    markup.forceLayout();
  };
  const undo = () => {
    travel(history.past.at(-1), "undo");
  };
  const redo = () => {
    travel(history.future[0], "redo");
  };
  // deviation:undo-off-while-markup
  const canUndo = history.past.length > 0 && !markup.editing;
  const canRedo = history.future.length > 0 && !markup.editing;

  // deviation:redo-shift-z deviation:undo-keys-outside-inputs
  const onKeyUp = useEffectEvent((event: KeyboardEvent) => {
    if (!event.ctrlKey || event.key.toLowerCase() !== "z" || isTyping(event.target)) return;
    if (event.shiftKey ? canRedo : canUndo) {
      if (event.shiftKey) redo();
      else undo();
    }
  });
  useEffect(() => {
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const typeLabel =
    meta.admin.afform_fields.type?.options?.find((option) => option.id === afform.type)?.label ??
    afform.type;
  const heading = `${typeLabel}: ${afform.title || ts("Untitled")}`;
  usePageHeading(root, heading);

  const classic = useContext(ClassicContext);
  // deviation:form-editor-classic-only
  const [changedBuilder] = useState(classicOnlyChanges);
  const saveBlocked = changedBuilder.length ? classicOnly() : null;
  const [errors, setErrors] = useState<string[]>([]);

  /** Set from the click until the save ends, so a second click cannot start another. */
  const busy = useRef(false);

  /** doSave(): open rich text closed first, so its edit is part of what is sent. */
  const save = async () => {
    if (busy.current) return;
    busy.current = true;
    if (markup.unapplied && !(await markup.applyHtml())) {
      busy.current = false;
      return;
    }
    applyOpenRichText(root.current ?? document);
    setSaveAsked((count) => count + 1);
  };

  // Runs after the panels got the form as it is sent.
  const saveChecked = async () => {
    const target = root.current ?? document;
    if (saveBlocked) {
      setErrors([saveBlocked]);
      return;
    }
    const problems = settingsProblems(afform);
    if (problems.length) {
      setErrors(problems);
      return;
    }
    const sent = afform;
    const before = history.saved;
    setSaving(true);
    const late = await pluginsReady(target);
    // Left while the panels checked: nothing is saved.
    if (!target.isConnected) return;
    if (latestAfform.current !== sent) {
      setErrors([ts("The form changed while other extensions checked it. Save again.")]);
      setSaving(false);
      return;
    }
    const verdict = pluginVerdict(target);
    const invalid = [...late, ...verdict.invalid];
    setErrors(invalid);
    const notes = invalid.length ? [] : verdict.notes;
    if (
      invalid.length ||
      (notes.length &&
        !window.confirm(`${ts("Other extensions report on this form:")}\n\n${notes.join("\n")}`))
    ) {
      setSaving(false);
      return;
    }
    // deviation:save-keeps-ts-calls deviation:save-keeps-unread-attributes
    await saveAfform<AfformDefinition>(savePayload(sent))
      .then((saved) => {
        if (!saved.name) throw new Error("Afform.save returned no name.");
        const name = saved.name;
        dispatch({ type: "savedFrom", sent, merge: (state) => ({ ...state, name }) });
        if (!sent.name) window.history.replaceState(window.history.state, "", `#/edit/${name}`);
        if (menuChanged(before, sent)) refreshMenubar();
      })
      .catch((failure: unknown) => {
        crmAlert(errorMessage(failure), ts("Save failed"), "error");
      })
      .finally(() => {
        setSaving(false);
      });
  };
  const doSave = useEffectEvent(() =>
    saveChecked().finally(() => {
      busy.current = false;
    }),
  );
  useEffect(() => {
    if (saveAsked) void doSave();
  }, [saveAsked]);

  const api: EditorApi = {
    meta,
    afform,
    entities,
    change,
    selected: shownSelection,
    select,
    addMeta: (loadedData) => {
      mergeMeta(loadedData);
    },
    removeEntity: (name) => {
      change((state) => removeEntity(state, name));
      select(null);
    },
    saveBlocked,
    openDialog: (open) => {
      setDialog(
        open(() => {
          setDialog(null);
        }),
      );
    },
  };

  const savedState = !dirty && !markup.unapplied;
  const link = formLink(afform);
  const canvasEntity = afform.type === "block" ? blockEntity(afform) : null;
  const status = saving ? "saving" : savedState ? "saved" : "unsaved";

  return (
    <EditorContext value={api}>
      <RenderContext value={render}>
        <div id="bootstrap-theme" ref={root}>
          <ClassicOnly
            changes={changedBuilder}
            message={classicOnly()}
            link={afform.name ? `${classic}#/edit/${afform.name}` : `${classic}#/`}
            linkText={
              afform.name
                ? ts("Edit this form in the classic builder.")
                : ts("Open the classic builder.")
            }
          />
          {errors.length > 0 && (
            // A new alert per attempt, so a repeated refusal is announced again.
            <div key={saveAsked} className="messages error no-popup" role="alert">
              <ul>
                {errors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          )}
          <div id="afGuiEditor" className="crm-flex-box afreact-editor">
            <CanvasDnd>
              <div id="afGuiEditor-palette" className="crm-flex-3">
                <Palette
                  displays={displays}
                  loading={loading}
                  link={link}
                  onAddEntity={onAddEntity}
                  onAddSearch={onAddSearch}
                />
              </div>
              <div id="afGuiEditor-canvas" className="crm-flex-5">
                <div className="panel panel-default">
                  <div className="panel-heading">
                    <div className="form-inline af-gui-canvas-control-buttons">
                      <button
                        className="btn btn-default"
                        type="button"
                        title={ts("Undo (Ctrl-Z)")}
                        aria-label={ts("Undo (Ctrl-Z)")}
                        disabled={!canUndo}
                        onClick={undo}
                      >
                        <i className="crm-i fa-undo" role="img" aria-hidden="true" />
                      </button>
                      <button
                        className="btn btn-default"
                        type="button"
                        title={ts("Redo (Ctrl-Shift-Z)")}
                        aria-label={ts("Redo (Ctrl-Shift-Z)")}
                        disabled={!canRedo}
                        onClick={redo}
                      >
                        <i className="crm-i fa-repeat" role="img" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="form-inline pull-right">
                      {savedState && !saving && link && (
                        <div className="form-group">
                          <a
                            className="afreact-view-page"
                            target="_blank"
                            rel="noreferrer"
                            href={link}
                          >
                            <i className="crm-i fa-external-link" role="img" aria-hidden="true" />{" "}
                            {ts("View Page")}
                          </a>
                        </div>
                      )}
                      <div className="btn-group btn-group-md">
                        <button
                          type="button"
                          className={`btn ${status === "saving" ? "btn-warning" : status === "saved" ? "btn-success" : "btn-primary"}`}
                          disabled={status !== "unsaved" || !afform.title}
                          onClick={() => {
                            void save();
                          }}
                        >
                          <i
                            className={`crm-i ${saving ? "fa-spin fa-spinner" : "fa-check"}`}
                            role="img"
                            aria-hidden="true"
                          />{" "}
                          {status === "saved"
                            ? ts("Saved")
                            : status === "saving"
                              ? ts("Saving...")
                              : ts("Save")}
                        </button>
                      </div>
                    </div>
                    <CanvasTabs
                      tab={markup.tab}
                      onLayout={markup.showLayout}
                      onMarkup={markup.showMarkup}
                    />
                  </div>
                  {markup.tab === "layout" ? (
                    <div
                      id="afGuiEditor-canvas-body"
                      role="tabpanel"
                      aria-labelledby="afreact-canvas-tab-layout"
                      className="panel-body"
                    >
                      <CanvasRoot
                        scope={{
                          path: canvasPath(afform),
                          entityName: canvasEntity,
                          dataEntity: canvasEntity ?? "",
                          inFieldset: false,
                          inBlock: false,
                          join: null,
                          label: heading,
                          axis: "y",
                        }}
                        nodes={canvasNodes(afform)}
                      />
                    </div>
                  ) : (
                    <div
                      role="tabpanel"
                      aria-labelledby="afreact-canvas-tab-markup"
                      className="panel-body"
                    >
                      {markup.panel}
                    </div>
                  )}
                </div>
              </div>
            </CanvasDnd>
          </div>
          {/* deviation:form-builder-panels */}
          <BuilderPanels record={savePayload(afform)} />
          {markup.dialog}
          {dialog}
        </div>
      </RenderContext>
    </EditorContext>
  );
}

const classicOnly = () =>
  ts(
    "Other extensions change the classic FormBuilder in ways this builder does not run, so forms are saved there.",
  );

function CanvasTabs({
  tab,
  onLayout,
  onMarkup,
}: {
  tab: "layout" | "markup";
  onLayout: () => void;
  onMarkup: () => void;
}) {
  const item = (key: "layout" | "markup", icon: string, label: string, onClick: () => void) => (
    <li role="presentation" className={tab === key ? "active" : undefined}>
      <a
        href="#"
        role="tab"
        id={`afreact-canvas-tab-${key}`}
        aria-selected={tab === key}
        onClick={tabClick(onClick)}
      >
        <i className={`crm-i ${icon}`} role="img" aria-hidden="true" /> <span>{label}</span>
      </a>
    </li>
  );
  return (
    <ul role="tablist" className="nav nav-tabs" aria-label={ts("Canvas")}>
      {item("layout", "fa-list-alt", ts("Layout"), onLayout)}
      {item("markup", "fa-code", ts("Markup"), onMarkup)}
    </ul>
  );
}
