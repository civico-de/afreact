import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { checkConditions, parseConditions } from "./conditions";
import { interpolate, type ExpressionContext } from "./expressions";
import { ClearButton, Field, fieldClasses } from "./Field";
import { loadSelected } from "./fields/autofill";
import { TokenContext, withTokens } from "./Markup";
import { FieldEnvContext, ItemPathContext, type FieldEnv } from "./fields/env";
import { UploadsContext } from "./fields/upload";
import {
  addRepeatItem,
  copyRepeatItem,
  deleteValue,
  ensurePrimary,
  fieldPlace,
  findElements,
  getValue,
  keepOffered,
  removeRepeatItem,
  repeatCount,
  setPrimary,
  setValue,
  type EntityDeclaration,
} from "./model";
import {
  FieldsetDisplay,
  FilterFieldNode,
  SearchFieldset,
  useSearchFieldset,
} from "./SearchFieldset";
import {
  defaultValue,
  hasTokens,
  initialiseNodes,
  refersToItself,
  replaceTokens,
  tokenValues,
} from "./structure";
import { adminMenuLinks, checkLinkPerm } from "./adminMenu";
import { AdminListMenu } from "./AdminListMenu";
import { ParamSets } from "./ParamSets";
import { Recaptcha2 } from "./Recaptcha2";
import { Menu } from "../search/Menu";
import type { ElementNode, FieldDefn, FormData, LayoutNode, Scope } from "./types";
import { isElement, isFieldDefn } from "./types";
import {
  ADMIN_MENU_NOTE,
  buttonOutsideFormNote,
  conditionNote,
  elementAttributes,
  expressionNote,
  fieldAttributesNote,
  joinOutsideFieldsetNote,
  missingFieldNote,
  nodeKind,
  renderedKind,
  type NodeKind,
  unknownFieldAttributes,
  unsupportedElement,
} from "./support";
import { Tabset } from "./Tabs";
import { tabOutsideNote } from "./tabsets";
import { Unsupported } from "./Unsupported";

export interface FormState {
  data: FormData;
  update: (change: (data: FormData) => FormData) => void;
  /** update() for a change the user makes, which counts in `edits`. */
  edit: (change: (data: FormData) => FormData) => void;
  /** Counts the user's changes, the saves and the prefill: an item's undo lasts while it stands. */
  edits: number;
  disabled: boolean;
  /** Also enabled while the saved form only retries its failed uploads. */
  submitDisabled: boolean;
  joinOffsets: WeakMap<ElementNode, number>;
  /** afCore's routeParams: fields shown later fill from them too. */
  routeParams: Record<string, string>;
  entities: Record<string, EntityDeclaration>;
  formName: string;
  /** afForm hides the submit button when the route opens a stored submission (sid). */
  showSubmitButton: boolean;
  /** False until Afform.prefill has landed; a token default waits for it. */
  prefilled: boolean;
  expressions: ExpressionContext;
  /** Item keys per repeated array, shared by every af-repeat over that array. */
  itemKeys: Map<string, number[]>;
  /** afForm.resetForm(); undefined outside af-form. */
  reset?: () => void;
  /** afForm.submitDraft() and the state its buttons show; undefined outside af-form. */
  draft?: { status: DraftStatus; save: () => void };
  /** crm-recaptcha2's response, sent as extra.recaptcha2, and the failed submissions that void it. */
  recaptcha?: { respond: (response: string | null) => void; failures: number };
  /** afCore's addTitle(): a search display reports the labels of its filters. */
  addTitle: (labels: string[]) => void;
}

/** A saved draft matches the form ("saved"), or nothing was changed since loading ("pristine"). */
export type DraftStatus = "pristine" | "unsaved" | "saving" | "saved";

export const FormContext = createContext<FormState | null>(null);
const ScopeContext = createContext<Scope | null>(null);
/**
 * Inside an af-if that turned false: the data it last rendered with. Fields drop their values
 * as on afIfDestroy; a nested af-if renders what it showed then.
 */
const HiddenContext = createContext<FormData | null>(null);
/** Inside an element of class af-markup, whose text afForm hands to afMarkup for tokens. */
const MarkupBlockContext = createContext(false);

function useForm(): FormState {
  const form = useContext(FormContext);
  if (!form) throw new Error("Layout rendered outside a FormContext");
  return form;
}

/** Tags React refuses children for, even an empty list. */
const VOID_TAGS = new Set(["br", "hr"]);

export function Nodes({ nodes }: { nodes: LayoutNode[] }): ReactNode {
  return nodes.map((node, index) => <Node key={index} node={node} />);
}

const Children = ({ node }: { node: ElementNode }) => <Nodes nodes={node["#children"] ?? []} />;

/** The component rendering each kind of element. */
const KIND_VIEWS: Record<NodeKind, (props: { node: ElementNode }) => ReactNode> = {
  conditional: Conditional,
  submitCondition: SubmitButtonCondition,
  entity: () => null,
  field: FieldNode,
  block: Children,
  form: FormNode,
  submit: SubmitButton,
  draft: DraftButton,
  reset: ResetButton,
  search: SearchNode,
  unknown: ({ node }) => (
    <>
      <Unsupported what={unsupportedElement(node) ?? ""} />
      <Children node={node} />
    </>
  ),
  searchFieldset: SearchFieldsetNode,
  fieldset: FieldsetNode,
  join: JoinNode,
  tabset: TabsetNode,
  tab: ({ node }) => (
    <>
      <Unsupported what={tabOutsideNote(node["#tag"])} />
      <Children node={node} />
    </>
  ),
  adminMenu: AdminMenu,
  adminListMenu: AdminListMenu,
  paramSets: ParamSets,
  recaptcha: Recaptcha2,
  element: Element,
};

/** afform_admin's edit links, each shown to a user who may follow it; the first opens the menu. */
function AdminMenu({ node }: { node: ElementNode }) {
  const links = adminMenuLinks(node);
  if (!links) return <Unsupported what={ADMIN_MENU_NOTE} />;
  const allowed = links.filter((link) => checkLinkPerm(link.permission, link.createdId));
  if (allowed[0] !== links[0]) return null;
  return (
    <Menu
      groupClass="btn-group crm-admin-block-context-dropdown dropup"
      buttonClass="btn dropdown-toggle btn-sm"
      label={<i className="crm-i fa-gear" role="img" aria-hidden="true" />}
      caret={false}
      srLabel={ts("Configure")}
      alignRight
      links={allowed.map((link) => ({
        url: link.url,
        target: "_blank",
        icon: link.icon,
        text: link.label.map((part) => part.text).join(""),
        content: link.label.map((part, index) =>
          part.emphasis ? <em key={index}>{part.text}</em> : part.text,
        ),
      }))}
    />
  );
}

/** af-form: tokens in its markup show the form's data. */
function FormNode({ node }: { node: ElementNode }) {
  const { data } = useForm();
  return (
    <TokenContext.Provider value={data}>
      <Children node={node} />
    </TokenContext.Provider>
  );
}

function TabsetNode({ node }: { node: ElementNode }) {
  const { formName, expressions, showSubmitButton, submitDisabled, draft } = useForm();
  // The draft handlers exist on a layout with an af-form, whose afFormCtrl shows the button.
  const submit = draft ? { shown: showSubmitButton, disabled: submitDisabled } : undefined;
  return (
    <Tabset
      {...{ node, formName, expressions, submit }}
      nodes={(nodes) => <Nodes nodes={nodes} />}
      element={(outer, children) => <Element node={outer}>{children}</Element>}
    />
  );
}

function Node({ node }: { node: LayoutNode }): ReactNode {
  if (!isElement(node)) {
    if ("#comment" in node) return null;
    // CRM_Afform_ArrayHtml writes non-breaking spaces as the entity.
    return <Text text={node["#text"].replaceAll("&nbsp;", "\u00a0")} />;
  }
  const View = KIND_VIEWS[nodeKind(node)];
  return <View node={node} />;
}

/** An element whose af-if or submit-button condition holds; the node itself goes on, so lookups by node still match. */
function Rendered({ node }: { node: ElementNode }): ReactNode {
  const View = KIND_VIEWS[renderedKind(node)];
  return <View node={node} />;
}

function Text({ text }: { text: string }) {
  const form = useForm();
  const markup = useContext(MarkupBlockContext);
  const shown = (value: string) => (markup ? withTokens(value) : value);
  if (!text.includes("{{")) return shown(text);
  const result = interpolate(text, form.expressions);
  return "text" in result ? (
    shown(result.text)
  ) : (
    <Unsupported what={expressionNote([result.unsupported])} />
  );
}

function Element({ node, children }: { node: ElementNode; children?: ReactNode }) {
  const form = useForm();
  const props: Record<string, unknown> = {};
  const unsupported: string[] = [];
  const resolve = (value: unknown): unknown => {
    if (typeof value !== "string" || !value.includes("{{")) return value;
    const result = interpolate(value, form.expressions);
    if ("text" in result) return result.text;
    unsupported.push(result.unsupported);
    return undefined;
  };
  for (const [prop, value] of elementAttributes(node)) {
    const resolved = resolve(value);
    // The style text goes to the element as written: shorthands, var() and !important included.
    if (prop === "style" && typeof resolved === "string") {
      props.ref = (element: HTMLElement | null) => {
        if (element) element.style.cssText = resolved;
      };
    } else props[prop] = resolved;
  }
  // afTitle's elements.
  const resolvedTitle = resolve(node["af-title"]);
  const title = typeof resolvedTitle === "string" ? resolvedTitle : null;
  const titleTag = TITLE_TAGS.get(node["#tag"]) ?? "h4";
  const heading = title ? createElement(titleTag, { className: "af-title" }, title) : null;
  const note = unsupported.length > 0 && <Unsupported what={expressionNote(unsupported)} />;
  if (VOID_TAGS.has(node["#tag"]))
    return (
      <>
        {note}
        {createElement(node["#tag"], props)}
      </>
    );
  const content = children ?? <Nodes nodes={node["#children"] ?? []} />;
  const markup = (typeof node.class === "string" ? node.class : "")
    .split(/\s+/)
    .includes("af-markup");
  return createElement(
    node["#tag"],
    props,
    note,
    heading,
    markup ? <MarkupBlockContext.Provider value>{content}</MarkupBlockContext.Provider> : content,
  );
}

/** afTitle's title element by container; other elements get an h4. */
const TITLE_TAGS = new Map([
  ["fieldset", "legend"],
  ["details", "summary"],
]);

type Evaluated = { value: boolean } | { error: string };

function evaluateConditions(attribute: string, data: FormData, name: string): Evaluated {
  try {
    return { value: checkConditions(parseConditions(attribute), data) };
  } catch (error) {
    console.warn(`[afreact] ${name} failed`, error);
    return { error: conditionNote(name, attribute) };
  }
}

/**
 * afIf: the element renders while its conditions hold, and whatever it renders initialises
 * its data then. Once hidden again, its subtree renders off-document so every field inside
 * drops its value, as on afIfDestroy. A condition that cannot be read renders nothing.
 */
function Conditional({ node }: { node: ElementNode }) {
  const form = useForm();
  const { update, joinOffsets, routeParams } = form;
  const scope = useContext(ScopeContext);
  const hiddenWith = useContext(HiddenContext);
  const data = hiddenWith ?? form.data;
  const result = evaluateConditions(String(node["af-if"]), data, "af-if");
  const shown = "value" in result && result.value;
  const active = shown && hiddenWith === null;
  const [shownWith, setShownWith] = useState<FormData | null>(null);
  const [detached] = useState(() => document.createElement("div"));
  const initialised = useRef(false);
  useEffect(() => {
    if (!active) {
      initialised.current = false;
      return;
    }
    if (initialised.current) return;
    initialised.current = true;
    update((current) => initialiseNodes([node], current, scope, joinOffsets, routeParams));
  }, [active, update, node, scope, joinOffsets, routeParams]);
  if (active && shownWith !== form.data) setShownWith(form.data);
  if ("error" in result) return <Unsupported what={result.error} />;
  if (shown) return <Rendered node={node} />;
  if (hiddenWith !== null || shownWith === null) return null;
  return createPortal(
    <HiddenContext.Provider value={shownWith}>
      <Rendered node={node} />
    </HiddenContext.Provider>,
    detached,
  );
}

function SubmitButtonCondition({ node }: { node: ElementNode }) {
  return useForm().showSubmitButton ? <Rendered node={node} /> : null;
}

function FieldsetNode({ node }: { node: ElementNode }) {
  const form = useForm();
  const entity = String(node["af-fieldset"]);
  if (node["af-repeat"] === undefined) {
    return (
      <ScopeContext.Provider value={{ entity, index: 0 }}>
        <ItemPathContext.Provider value={entity}>
          <Element node={node} />
        </ItemPathContext.Provider>
      </ScopeContext.Provider>
    );
  }
  return (
    <Repeat
      node={node}
      scope={{ entity, index: 0 }}
      itemScope={(index) => ({ entity, index })}
      count={repeatCount(form.data, { entity, index: 0 })}
    />
  );
}

function SearchFieldsetNode({ node }: { node: ElementNode }) {
  return (
    <SearchFieldset node={node} formName={useForm().formName}>
      <Element node={node} />
    </SearchFieldset>
  );
}

function JoinNode({ node }: { node: ElementNode }) {
  const form = useForm();
  const parent = useContext(ScopeContext);
  const path = useContext(ItemPathContext);
  if (!parent) return <Unsupported what={joinOutsideFieldsetNote(String(node["af-join"]))} />;
  const scope = { entity: parent.entity, index: parent.index, join: String(node["af-join"]) };
  const offset = form.joinOffsets.get(node) ?? 0;
  // Each join block by its place in the layout, which removing items does not shift.
  return (
    <ItemPathContext.Provider value={`${path}/${scope.join}@${offset}`}>
      {node["af-repeat"] === undefined ? (
        <ScopeContext.Provider value={{ ...scope, joinIndex: offset }}>
          <Element node={node} />
        </ScopeContext.Provider>
      ) : (
        <Repeat
          node={node}
          scope={scope}
          itemScope={(joinIndex) => ({ ...scope, joinIndex, repeated: true })}
          count={repeatCount(form.data, scope)}
        />
      )}
    </ItemPathContext.Provider>
  );
}

interface RepeatProps {
  node: ElementNode;
  scope: Scope;
  itemScope: (position: number) => Scope;
  count: number;
}

/**
 * A stable key per item of a repeated array, as ng-repeat tracks items by identity: removing
 * an item keeps the state of the items after it, in every repeat over the same array.
 */
function useItemKeys(
  id: string,
  count: number,
): [number[], (position: number) => void, (keys: number[]) => void] {
  const { itemKeys } = useForm();
  let keys = itemKeys.get(id) ?? [];
  if (keys.length !== count) {
    keys = keys.slice(0, count);
    for (let key = Math.max(-1, ...keys) + 1; keys.length < count; key++) keys.push(key);
    itemKeys.set(id, keys);
  }
  const remove = (position: number) => {
    itemKeys.set(
      id,
      keys.filter((_, index) => index !== position),
    );
  };
  const restore = (saved: number[]) => {
    itemKeys.set(id, saved);
  };
  return [keys, remove, restore];
}

/**
 * A removed item, which Undo brings back until the next edit, save or prefill; updates that
 * follow from the removal (an af-if it flips) return with it.
 */
interface Removal {
  position: number;
  key: number;
  keys: number[];
  before: FormData;
  edits: number;
  /** The files chosen in the item's File fields, by owner. */
  files: [string, File][];
}

/** af-repeat in afRepeat.html's markup: one copy of the children per item, with add/copy/remove inside the min/max bounds. */
function Repeat({ node, scope, itemScope, count }: RepeatProps) {
  const form = useForm();
  const uploads = useContext(UploadsContext);
  const path = useContext(ItemPathContext);
  const id = scope.join === undefined ? scope.entity : path;
  const [keys, removeKey, restoreKeys] = useItemKeys(id, count);
  // deviation:repeat-remove-undo
  // Undo stands in the removed item's place until the next change to the form.
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [restored, setRestored] = useState<{ key: number } | null>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const undoNote = useId();
  const restoredButton = useRef<HTMLButtonElement>(null);
  if (removal && removal.edits !== form.edits) setRemoval(null);
  useEffect(() => {
    if (removal) undoButton.current?.focus();
  }, [removal]);
  useEffect(() => {
    if (restored) restoredButton.current?.focus();
  }, [restored]);
  // Same bounds as afRepeat's canAdd/canRemove: no min means every item can go.
  const min = Number(node.min ?? 0);
  const max = Number(node.max ?? 0);
  const text = (attr: string) => (typeof node[attr] === "string" ? node[attr] : "");
  const addLabel = text("af-repeat");
  const canAdd = !max || count < max;
  const children = node["#children"] ?? [];
  // A new item's fields and repeats initialise as afField and afRepeat do on render.
  // afField's watcher: while the items have an is_primary field, one of them is primary.
  const hasPrimary = findElements(children, "af-field").some(
    (field) => field.name === "is_primary",
  );
  const primaryKept = (data: FormData) => (hasPrimary ? ensurePrimary(data, scope) : data);
  const initialiseLast = (data: FormData) => {
    const last = itemScope(repeatCount(data, scope) - 1);
    return primaryKept(initialiseNodes(children, data, last, form.joinOffsets, form.routeParams));
  };
  const items = keys.map((key, position) => (
    <div af-repeat-item="" key={key}>
      <ScopeContext.Provider value={itemScope(position)}>
        <ItemPathContext.Provider value={`${id}#${key}`}>
          <Nodes nodes={children} />
        </ItemPathContext.Provider>
      </ScopeContext.Provider>
      {count > min && (
        <button
          type="button"
          className="btn btn-xs af-repeat-remove-btn"
          disabled={form.disabled}
          ref={key === restored?.key ? restoredButton : undefined}
          onClick={() => {
            const inItem = `${id}#${key}/`;
            const files = [...(uploads?.pending.values() ?? [])]
              .filter((upload) => upload.owner.startsWith(inItem))
              .map((upload): [string, File] => [upload.owner, upload.file]);
            setRemoval({ position, key, keys, before: form.data, edits: form.edits + 1, files });
            removeKey(position);
            form.edit((data) => primaryKept(removeRepeatItem(data, scope, position)));
          }}
        >
          <i className="crm-i fa-ban" aria-hidden="true" />
          <span className="sr-only">{ts("Remove")}</span>
        </button>
      )}
    </div>
  ));
  if (removal)
    items.splice(
      removal.position,
      0,
      <p className="afreact-repeat-undo" key="undo">
        <span id={undoNote}>{ts("Removed.")}</span>{" "}
        <button
          type="button"
          className="btn btn-sm"
          ref={undoButton}
          aria-describedby={undoNote}
          disabled={form.disabled}
          onClick={() => {
            for (const [owner, file] of removal.files) uploads?.restored.set(owner, file);
            restoreKeys(removal.keys);
            setRestored({ key: removal.key });
            setRemoval(null);
            form.update(() => removal.before);
          }}
        >
          <i className="crm-i fa-undo" aria-hidden="true" /> {ts("Undo")}
        </button>
      </p>,
    );
  return (
    <Element node={node}>
      {items}
      {canAdd && (
        <button
          type="button"
          className="btn btn-sm af-repeat-add-btn"
          disabled={form.disabled}
          onClick={() => {
            form.edit((data) => initialiseLast(addRepeatItem(data, scope)));
          }}
        >
          <i className={`crm-i ${text("add-icon") || "fa-plus"}`} aria-hidden="true" />
          {/* An empty af-repeat shows only the icon, which still needs a name. */}
          {/* deviation:repeat-button-names */}
          {addLabel ? ` ${addLabel}` : <span className="sr-only">{ts("Add")}</span>}
        </button>
      )}
      {/* afRepeat.html's line break between the buttons. */}{" "}
      {canAdd && text("af-copy") && count > 0 && (
        <button
          type="button"
          className="btn btn-sm af-repeat-copy-btn"
          disabled={form.disabled}
          onClick={() => {
            form.edit((data) => initialiseLast(copyRepeatItem(data, scope)));
          }}
        >
          <i className={`crm-i ${text("copy-icon") || "fa-copy"}`} aria-hidden="true" />{" "}
          {text("af-copy")}
        </button>
      )}
    </Element>
  );
}

function FieldNode({ node }: { node: ElementNode }) {
  const place = fieldPlace(node, useContext(ScopeContext));
  const hidden = useContext(HiddenContext);
  const filters = useSearchFieldset();
  const defn = node.defn;
  const scope = place?.scope ?? null;
  const name = place?.name ?? String(node.name);
  if (filters && !scope) return <FilterFieldNode node={node} fieldset={filters} />;
  if (!scope || !isFieldDefn(defn)) return <Unsupported what={missingFieldNote(name)} />;
  if (hidden !== null) return <DroppedField scope={scope} name={name} defn={defn} />;
  return <VisibleField node={node} scope={scope} name={name} defn={defn} />;
}

interface FieldNodeProps {
  scope: Scope;
  name: string;
  defn: FieldDefn;
}

function DroppedField({ scope, name, defn }: FieldNodeProps) {
  const { update } = useForm();
  const dropped = useRef(false);
  useEffect(() => {
    if (dropped.current || defn.input_type === "DisplayOnly") return;
    dropped.current = true;
    update((data) => deleteValue(data, scope, name));
  }, [update, scope, name, defn.input_type]);
  return null;
}

function conditionResult(node: ElementNode, form: FormState, attr: string): Evaluated | null {
  const attribute = node[attr];
  return typeof attribute === "string" ? evaluateConditions(attribute, form.data, attr) : null;
}

interface VisibleOptions {
  options: FieldDefn["options"];
  errors: string[];
}

/** afField's getOptions(): an option with conditions shows while they hold; a broken rule shows it. */
function visibleOptions(defn: FieldDefn, data: FormData): VisibleOptions {
  if (!Array.isArray(defn.options)) return { options: defn.options, errors: [] };
  const errors: string[] = [];
  const options = defn.options.filter((option) => {
    if (!option.if?.length) return true;
    try {
      return checkConditions(option.if, data);
    } catch {
      errors.push(`option ${String(option.id)} if=${JSON.stringify(option.if)}`);
      return true;
    }
  });
  return { options, errors };
}

/** The option IDs a conditional option list offers, typed as afField types them; null without conditions. */
function offeredIds(given: FieldDefn, visible: FieldDefn["options"]): unknown[] | null {
  const conditional =
    Array.isArray(given.options) && given.options.some((option) => option.if?.length);
  if (!conditional || !Array.isArray(visible)) return null;
  return visible.map((option) => (given.data_type === "Boolean" ? Boolean(option.id) : option.id));
}

/**
 * afField's calculated default: the token default is recalculated whenever a field it refers
 * to changes, until the user has left one of this field's inputs (ng-touched).
 */
function useTokenDefault(
  given: FieldDefn,
  scope: Scope,
  name: string,
  element: RefObject<HTMLElement | null>,
): string | null {
  const form = useForm();
  const { update } = form;
  const template = hasTokens(given.afform_default) ? given.afform_default : null;
  const loops = template !== null && refersToItself(template, scope, name);
  const tokens = template === null ? null : JSON.stringify(tokenValues(template, form.data));
  const touched = useRef(false);
  // deviation:token-default-keeps-loaded
  // A value from the route or the prefill outlasts the first calculation, as afForm sets it last.
  const held = getValue(form.data, scope, name) !== undefined;
  const ready = form.prefilled;
  const calculatedFor = useRef<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    const target = element.current;
    const touch = ({ target: left }: FocusEvent) => {
      if (left instanceof HTMLElement && left.matches("input, select, textarea"))
        touched.current = true;
    };
    target?.addEventListener("focusout", touch);
    return () => {
      target?.removeEventListener("focusout", touch);
    };
  }, [element]);
  useEffect(() => {
    if (!ready || template === null || loops || touched.current) return;
    if (!started.current) {
      started.current = true;
      if (held) {
        calculatedFor.current = tokens;
        return;
      }
    }
    if (calculatedFor.current === tokens) return;
    calculatedFor.current = tokens;
    update((data) =>
      setValue(data, scope, name, defaultValue(given, replaceTokens(template, data))),
    );
  }, [ready, held, template, loops, tokens, update, scope, name, given]);
  return loops ? `afform_default ${JSON.stringify(template)} refers to its own field` : null;
}

/** afField's validateValue(): when the visible options change, a value they no longer offer goes. */
function useOfferedValue(offered: unknown[] | null, scope: Scope, name: string) {
  const { update } = useForm();
  const key = offered === null ? null : JSON.stringify(offered);
  const validatedFor = useRef(key);
  useEffect(() => {
    if (offered === null || validatedFor.current === key) return;
    validatedFor.current = key;
    update((data) => keepOffered(data, scope, name, offered));
  }, [offered, key, update, scope, name]);
}

/**
 * afField's live rules: af-required and af-disabled conditions, conditional options,
 * and a token default recalculated from other fields until the user leaves the field.
 */
function VisibleField({ node, scope, name, defn: given }: FieldNodeProps & { node: ElementNode }) {
  const form = useForm();
  const element = useRef<HTMLElement>(null);
  const required = conditionResult(node, form, "af-required");
  const disabled = conditionResult(node, form, "af-disabled");
  const visible = visibleOptions(given, form.data);
  const defn: FieldDefn = {
    ...given,
    options: visible.options,
    required: required && "value" in required ? required.value : given.required,
  };
  const loop = useTokenDefault(given, scope, name, element);
  useOfferedValue(offeredIds(given, visible.options), scope, name);
  const value = getValue(form.data, scope, name);
  const unknown = [
    ...unknownFieldAttributes(node),
    ...[required, disabled].flatMap((result) =>
      result && "error" in result ? [result.error] : [],
    ),
    ...visible.errors,
    ...(loop ? [loop] : []),
  ];
  const conditionallyDisabled = !!disabled && "value" in disabled && disabled.value;
  // afField: a field that selects a record (autofill) is read-only when the entity forbids that action.
  const autofill = defn.input_attrs?.autofill;
  const readonly =
    scope.join === undefined &&
    !!autofill &&
    form.entities[scope.entity]?.actions[autofill] === false;
  const primary = name === "is_primary" && scope.repeated;
  return createElement(
    "af-field",
    {
      ref: element,
      // An extra field's element has no name attribute, as in the form's own markup.
      name: node.name ? name : undefined,
      className:
        `${primary ? "af-field-type-radio" : fieldClasses(defn)} ${typeof node.class === "string" ? node.class : ""}`.trim(),
    },
    unknown.length > 0 && <Unsupported what={fieldAttributesNote(unknown, name)} />,
    primary ? (
      <PrimaryField
        label={typeof defn.label === "string" && defn.label !== "" ? defn.label : ts("Primary")}
        group={`${form.formName}-${scope.entity}-${scope.index}-${scope.join ?? ""}`}
        checked={value === true}
        disabled={form.disabled || conditionallyDisabled}
        onSelect={() => {
          form.edit((data) => setPrimary(data, scope));
        }}
        onClear={() => {
          form.edit((data) => ensurePrimary(setValue(data, scope, name, null), scope));
        }}
      />
    ) : (
      <FieldEnvContext.Provider value={fieldEnv(form, scope, name, autofill)}>
        <Field
          defn={defn}
          value={value}
          disabled={form.disabled || readonly || conditionallyDisabled}
          onChange={(next) => {
            form.edit((data) => setValue(data, scope, name, next));
          }}
        />
      </FieldEnvContext.Provider>
    ),
  );
}

/** What EntityRef and ChainSelect send about the field; an autofill field loads the record it selects. */
function fieldEnv(
  form: FormState,
  scope: Scope,
  name: string,
  autofill: string | undefined,
): FieldEnv {
  const entityItem = form.data[scope.entity]?.[scope.index];
  const values =
    scope.join === undefined
      ? entityItem?.fields
      : entityItem?.joins?.[scope.join]?.[scope.joinIndex ?? 0];
  return {
    formName: form.formName,
    modelName: scope.entity,
    joinEntity: scope.join,
    fieldName: name,
    values: values ?? {},
    entityData: form.entities[scope.entity]?.data,
    entityIndex: scope.index,
    joinIndex: scope.join === undefined ? undefined : (scope.joinIndex ?? 0),
    onSelect: autofill
      ? async (id) => {
          form.edit(await loadSelected(form.formName, scope, name, id, form.entities));
        }
      : undefined,
  };
}

interface PrimaryFieldProps {
  label: string;
  group: string;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
  onClear: () => void;
}

// deviation:repeat-primary-radio-name
/** afField turns is_primary in a repeat into one radio per record; the records share a radio group. */
function PrimaryField({ label, group, checked, disabled, onSelect, onClear }: PrimaryFieldProps) {
  const id = useId();
  return (
    <>
      <label className="crm-af-field-label" htmlFor={id}>
        {label}
      </label>
      <div className="crm-af-field">
        <label className="radio-inline">
          <input
            id={id}
            type="radio"
            className="crm-form-radio"
            name={group}
            checked={checked}
            disabled={disabled}
            onChange={onSelect}
          />
        </label>
        {checked && !disabled && <ClearButton onClear={onClear} />}
      </div>
    </>
  );
}

interface FormButtonProps {
  node: ElementNode;
  disabled: boolean;
  onClick?: () => void;
  /** afForm's text and icon for a draft being saved or saved. */
  shown?: { text: string; icon: string };
}

function FormButton({ node, disabled, onClick, shown }: FormButtonProps) {
  const icon = shown?.icon ?? (typeof node["crm-icon"] === "string" ? node["crm-icon"] : null);
  return (
    <button
      type={onClick ? "button" : "submit"}
      className={typeof node.class === "string" ? node.class : "btn btn-primary"}
      disabled={disabled}
      onClick={onClick}
    >
      {icon && <i className={`crm-i ${icon}`} aria-hidden="true" />}{" "}
      {shown?.text ?? <Nodes nodes={node["#children"] ?? []} />}
    </button>
  );
}

function SubmitButton({ node }: { node: ElementNode }) {
  return <FormButton node={node} disabled={useForm().submitDisabled} />;
}

/** afForm's draft buttons: enabled while the form holds changes no draft has saved. */
function DraftButton({ node }: { node: ElementNode }) {
  const form = useForm();
  const { draft } = form;
  if (!draft) return <Unsupported what={buttonOutsideFormNote("draft")} />;
  const shown =
    draft.status === "saving"
      ? { text: ts("Saving Draft"), icon: "fa-spinner fa-spin" }
      : draft.status === "saved"
        ? { text: ts("Draft Saved"), icon: "fa-check" }
        : undefined;
  return (
    <FormButton
      node={node}
      disabled={form.disabled || draft.status !== "unsaved"}
      onClick={draft.save}
      shown={shown}
    />
  );
}

function ResetButton({ node }: { node: ElementNode }) {
  const form = useForm();
  if (!form.reset) return <Unsupported what={buttonOutsideFormNote("reset")} />;
  return <FormButton node={node} disabled={form.disabled} onClick={form.reset} />;
}

function SearchNode({ node }: { node: ElementNode }) {
  const form = useForm();
  // A display under a hidden af-if loads nothing.
  if (useContext(HiddenContext) !== null) return null;
  return <FieldsetDisplay node={node} formName={form.formName} onLabels={form.addTitle} />;
}
