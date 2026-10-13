import { useId, useState } from "react";
import { ConfirmDialog } from "../../widgets/ConfirmDialog";
import { Picker } from "../../widgets/Picker";
import { PartNotice, PluginElement } from "../canvas/plugins";
import {
  behaviorEditable,
  behaviorTag,
  entityOptionsEditable,
  entityOptionsTag,
  GENERIC_OPTIONS,
  GROUP_OPTIONS,
  RELATIONSHIP_BEHAVIOR,
} from "../editable";
import { canvasNodes, editNode, useEditor, type EditorApi, type FormEntity } from "../context";
import { plainLiteral } from "../fields";
import { FieldValue } from "../FieldValue";
import { encodeLiteral, isLiteralObject, toLiteral, type Literal } from "../literal";
import { getField, type Behavior, type GuiField } from "../meta";
import { entityReferences, jsAttribute, textAttribute, withAttribute } from "../model";
import type { ShallowElement } from "../tree";
import {
  HelpLink,
  PaletteAdd,
  PaletteList,
  PaletteSection,
  PanelHead,
  usePaletteSearch,
} from "./common";
import {
  entityBlockInUse,
  entityBlockItems,
  entityFieldGroups,
  entityFieldInUse,
  entityFieldsetItem,
} from "./lists";

/** The entity's `data` values, their literals kept. */
function entityData(node: ShallowElement): Record<string, Literal> {
  const data = jsAttribute(node, "data");
  return isLiteralObject(data) ? data : {};
}

const unsuffixed = (name: string) => name.split(":")[0] ?? name;

/** An edit of the af-entity element, one undo step. */
function useEntityEdit(editor: EditorApi, entity: FormEntity) {
  return (update: (node: ShallowElement) => ShallowElement) => {
    const path = entity.path;
    if (!path) throw new Error("A block's entity has no element to change.");
    editor.change((afform) => editNode(afform, editor.meta, path, update));
  };
}

/** The value's field: a dynamic foreign key resolved by its controlling field's value. */
function valueField(
  field: GuiField,
  data: Record<string, Literal>,
): { field: GuiField; unsetControl: string | null } {
  const attrs = isRecord(field.input_attrs) ? field.input_attrs : {};
  const control = typeof attrs.control_field === "string" ? attrs.control_field : null;
  const targets = isRecord(field.dfk_entities) ? field.dfk_entities : null;
  if (!control || !targets) return { field, unsetControl: null };
  const controlValue = plainLiteral(data[control] ?? null);
  if (!controlValue) return { field, unsetControl: control };
  const target =
    typeof controlValue === "string" || typeof controlValue === "number"
      ? targets[String(controlValue)]
      : undefined;
  return {
    field: { ...field, fk_entity: typeof target === "string" ? target : null },
    unsetControl: null,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** entityDataGetterSetter(): a `:name` value shown and set by option id. */
function suffixed(field: GuiField, fieldName: string) {
  const suffix = fieldName.split(":").slice(1).join(":");
  const options = Array.isArray(field.options) ? field.options : [];
  return {
    read: (value: unknown) => {
      if (!suffix) return value;
      const match = options.find((option) => String(option[suffix]) === String(value));
      return match ? match.id : value;
    },
    write: (value: unknown) => {
      if (!suffix) return value;
      const match = options.find((option) => String(option.id) === String(value));
      return match ? match[suffix] : value;
    },
  };
}

/** The entity's preset values: one input per value, and a picker adding one. */
function EntityValues({ entity }: { entity: FormEntity }) {
  const editor = useEditor();
  const id = useId();
  const edit = useEntityEdit(editor, entity);
  const data = entityData(entity.node);
  const fields = editor.meta.gui.entities[entity.type]?.fields ?? {};
  const canvas = canvasNodes(editor.afform);
  const setData = (update: (data: Record<string, Literal>) => Record<string, Literal>) => {
    edit((node) => ({ ...node, data: encodeLiteral(update(entityData(node))) }));
  };
  const fieldId = (fieldName: string) =>
    `${id}-${entity.name}-${fieldName}`.replace(/[^\w-]/g, "-");
  // deviation:entity-add-value-omits-used
  const addable = Object.values(fields)
    .filter((field) => !entityFieldInUse(editor.meta, entity.name, data, canvas, field.name, null))
    .map((field) => ({ id: field.name, label: field.label ?? field.name }));
  const shown = Object.keys(data).filter(
    (fieldName) =>
      !!fields[unsuffixed(fieldName)] && !!getField(editor.meta, entity.type, fieldName),
  );
  return (
    <PaletteSection
      name="entity-values"
      title={ts("Values")}
      summary={
        shown.length ? ts("1 value", { plural: "%count values", count: shown.length }) : ts("None")
      }
      className="af-gui-entity-values"
    >
      {shown.map((fieldName) => {
        const meta = fields[unsuffixed(fieldName)];
        const spec = getField(editor.meta, entity.type, fieldName);
        if (!meta || !spec) return null;
        const value = plainLiteral(data[fieldName] ?? null);
        const isDate = spec.input_type === "Date";
        const { field, unsetControl } = valueField(spec, data);
        const convert = suffixed(meta, fieldName);
        const set = (next: unknown) => {
          setData((current) => ({ ...current, [fieldName]: toLiteral(next) }));
        };
        // deviation:palette-value-cards
        return (
          <div key={fieldName} className="afreact-value-card">
            <label className="af-gui-block-label" htmlFor={fieldId(fieldName)}>
              {meta.label ?? meta.name}:
            </label>
            {isDate && (
              <label className="af-gui-block-label">
                <input
                  type="radio"
                  name={`${fieldId(fieldName)}-now`}
                  checked={value === "now"}
                  onChange={() => {
                    set("now");
                  }}
                />{" "}
                {ts("Current Date")}
              </label>
            )}
            <div className="form-inline">
              {isDate && (
                <input
                  type="radio"
                  name={`${fieldId(fieldName)}-now`}
                  aria-label={ts("Fixed date")}
                  checked={value !== "now"}
                  onChange={() => {
                    set("");
                  }}
                />
              )}
              {isDate && value === "now" ? (
                <input disabled className="form-control" placeholder={ts("Pick Date")} />
              ) : unsetControl ? (
                <input
                  disabled
                  className="form-control"
                  id={fieldId(fieldName)}
                  placeholder={ts("Set %1 first", {
                    1: fields[unsetControl]?.label ?? unsetControl,
                  })}
                />
              ) : (
                <FieldValue
                  id={fieldId(fieldName)}
                  field={field}
                  value={convert.read(value)}
                  onChange={(next) => {
                    set(convert.write(next));
                  }}
                />
              )}{" "}
              <button
                type="button"
                className="btn btn-link btn-xs afreact-value-remove"
                aria-label={ts("Remove %1", { 1: meta.label ?? meta.name })}
                title={ts("Remove")}
                onClick={() => {
                  setData((current) =>
                    Object.fromEntries(
                      Object.entries(current).filter(([key]) => key !== fieldName),
                    ),
                  );
                }}
              >
                <i className="crm-i fa-times" role="img" aria-hidden="true" />
              </button>
            </div>
          </div>
        );
      })}
      <div className="form-inline">
        <Picker
          id={`${id}-add-value`}
          label={ts("Add value")}
          hiddenLabel
          placeholder={ts("Add value")}
          options={addable}
          value={[]}
          single
          onChange={([fieldName]) => {
            if (fieldName !== undefined)
              setData((current) => ({ ...current, [String(fieldName)]: "" }));
          }}
        />
      </div>
    </PaletteSection>
  );
}

/** The entity's add list: its fieldset, its blocks, its and its joins' fields. */
function EntityPalette({ entity }: { entity: FormEntity }) {
  const editor = useEditor();
  const [search, setSearch] = usePaletteSearch(entity.name);
  const term = search.toLowerCase();
  const canvas = canvasNodes(editor.afform);
  const data = entityData(entity.node);
  const fieldset = entity.path
    ? entityFieldsetItem(editor.meta, entity.name, entity.label, term)
    : null;
  const [own, ...joins] = entityFieldGroups(editor.meta, entity.name, entity.type, canvas, term);
  // The fieldset opens the entity's own fields rather than a group of its own.
  const groups = own
    ? [{ ...own, items: [...(fieldset ? [fieldset] : []), ...own.items] }, ...joins]
    : [];
  return (
    <PaletteAdd name="entity-add" title={ts("Add")} search={search} onSearch={setSearch}>
      <PaletteList
        label={ts("Blocks")}
        items={entityBlockItems(editor.meta, editor.afform, entity.type, term)}
        entity={entity.name}
        inUse={(item) => entityBlockInUse(editor.meta, entity.name, canvas, item.node)}
      />
      {groups.map((group) => (
        <PaletteList
          key={group.entityName}
          label={group.label}
          items={group.items}
          entity={group.entityName}
          inUse={(item) =>
            item !== fieldset &&
            entityFieldInUse(
              editor.meta,
              entity.name,
              data,
              canvas,
              textAttribute(item.node, "name") ?? "",
              group.afJoin,
            )
          }
        />
      ))}
    </PaletteAdd>
  );
}

const SECURITY_MODES = () => [
  {
    id: "RBAC",
    icon: "fa-user",
    label: ts("User-Based"),
    description: ts("Inherit permissions based on the current user or role"),
  },
  {
    id: "FBAC",
    icon: "fa-file-text",
    label: ts("Form-Based"),
    description: ts("Allow access to any fields listed on the form"),
  },
];

function entityActions(node: ShallowElement): Record<string, unknown> {
  const actions = plainLiteral(jsAttribute(node, "actions") ?? null);
  return isRecord(actions) ? actions : {};
}

/** The create and update checkboxes, under the names the entity gives them. */
function ActionBoxes({
  entity,
  create,
  update,
}: {
  entity: FormEntity;
  create: string;
  update: string;
}) {
  const editor = useEditor();
  const edit = useEntityEdit(editor, entity);
  const actions = entityActions(entity.node);
  const box = (key: "create" | "update", label: string) => (
    <div className="checkbox-inline">
      <label>
        <input
          type="checkbox"
          checked={!!actions[key]}
          onChange={(event) => {
            const checked = event.target.checked;
            edit((node) =>
              withAttribute(editor.meta.types, node, "actions", {
                ...entityActions(node),
                [key]: checked,
              }),
            );
          }}
        />
        {label}
      </label>
    </div>
  );
  return (
    <>
      {box("create", create)}
      {box("update", update)}
    </>
  );
}

/** EntityOptionsGeneric: security, allowed actions, and the record id from the address. */
function GenericOptions({ entity, link }: { entity: FormEntity; link: string | null }) {
  const editor = useEditor();
  const id = useId();
  const edit = useEntityEdit(editor, entity);
  const security = textAttribute(entity.node, "security") ?? "";
  const urlAutofill = textAttribute(entity.node, "url-autofill") === "1";
  const label = editor.meta.gui.entities[entity.type]?.label ?? entity.type;
  return (
    <>
      <div className="form-group">
        <label className="control-label" htmlFor={`${id}-security`}>
          {ts("Security")} <HelpLink id="entity-security" title={ts("Security")} />
        </label>
        <Picker
          id={`${id}-security`}
          label={ts("Security")}
          externalLabel
          placeholder=""
          options={SECURITY_MODES()}
          value={security ? [security] : []}
          single
          onChange={([mode]) => {
            edit((node) => withAttribute(editor.meta.types, node, "security", mode ?? null));
          }}
        />
      </div>
      <div className="form-group" role="group" aria-labelledby={`${id}-actions`}>
        <span id={`${id}-actions`} className="afreact-palette-label">
          {ts("Allowed Actions")} <HelpLink id="entity-actions" title={ts("Allowed Actions")} />
        </span>
        <ActionBoxes entity={entity} create={ts("Create")} update={ts("Update")} />
      </div>
      {!!entityActions(entity.node).update && (
        <div>
          <div className="checkbox">
            <label>
              <input
                type="checkbox"
                checked={urlAutofill}
                onChange={(event) => {
                  const value = event.target.checked ? "1" : "0";
                  edit((node) => withAttribute(editor.meta.types, node, "url-autofill", value));
                }}
              />
              {ts("Accept ID from URL")}
            </label>
          </div>
          {urlAutofill && (
            <div className="description">
              <p>
                {ts("Update %1 by including the id in the link to this form:", {
                  1: entity.name,
                })}{" "}
                <code>{`${link ?? ""}#?${entity.name}=123`}</code>
              </p>
              <p>
                {ts(
                  "If you have made a repeating container for %1, you may update multiple %2s using comma-separated ids:",
                  { 1: entity.name, 2: label },
                )}{" "}
                <code>{`${link ?? ""}#?${entity.name}=123,456`}</code>
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** The entity's options: core's two templates, an extension's element, or a notice. */
function EntityOptions({ entity, link }: { entity: FormEntity; link: string | null }) {
  const editor = useEditor();
  const edit = useEntityEdit(editor, entity);
  const template = editor.meta.gui.entities[entity.type]?.options_tpl ?? GENERIC_OPTIONS;
  if (template === GENERIC_OPTIONS) return <GenericOptions entity={entity} link={link} />;
  if (template === GROUP_OPTIONS)
    return (
      <div className="form-group" role="group" aria-label={ts("Allowed Actions")}>
        <span className="afreact-palette-label">{ts("Allowed Actions")}</span>
        <ActionBoxes entity={entity} create={ts("Subscribe")} update={ts("Unsubscribe")} />
      </div>
    );
  if (!entityOptionsEditable(entity.type, template))
    return <PartNotice part={ts("The options of %1", { 1: entity.label })} />;
  return (
    <PluginElement
      tag={entityOptionsTag(entity.type)}
      props={{ entity: entity.node }}
      detailKey="entity"
      onChange={(next) => {
        edit(() => ({ ...next, "#tag": "af-entity" }));
      }}
    />
  );
}

/** The contact a relationship autofill starts from: an autocomplete of its contact type. */
function RelationshipAutofill({ entity, behavior }: { entity: FormEntity; behavior: Behavior }) {
  const editor = useEditor();
  const id = useId();
  const edit = useEntityEdit(editor, entity);
  const selected = textAttribute(entity.node, behavior.key) ?? "";
  const mode = behavior.modes.find((each) => each.name === selected);
  const contactType =
    typeof mode?.contact_type === "string" && mode.contact_type ? mode.contact_type : "Contact";
  const placeholder = ts("Select %1", {
    1: editor.meta.gui.entities[contactType]?.label ?? contactType,
  });
  const value = textAttribute(entity.node, "autofill-relationship") ?? "";
  return (
    <div>
      <label htmlFor={`${id}-related`} className="sr-only">
        {placeholder}
      </label>
      <FieldValue
        id={`${id}-related`}
        field={{
          name: "autofill-relationship",
          label: placeholder,
          input_type: "EntityRef",
          data_type: "Integer",
          fk_entity: contactType,
        }}
        value={value}
        onChange={(next) => {
          edit((node) =>
            withAttribute(
              editor.meta.types,
              node,
              "autofill-relationship",
              (typeof next === "number" ? String(next) : typeof next === "string" ? next : "") ||
                null,
            ),
          );
        }}
      />
    </div>
  );
}

/** One behavior: its mode picker, the relationship autofill's contact, or an extension's element. */
function BehaviorSettings({ entity, behavior }: { entity: FormEntity; behavior: Behavior }) {
  const editor = useEditor();
  const id = useId();
  const edit = useEntityEdit(editor, entity);
  const selected = textAttribute(entity.node, behavior.key) ?? "";
  const custom = behavior.template && behavior.template !== RELATIONSHIP_BEHAVIOR;
  if (custom) {
    if (!behaviorEditable(behavior.key, behavior.template))
      return <PartNotice part={behavior.title} />;
    return (
      <PluginElement
        tag={behaviorTag(behavior.key)}
        props={{ entity: entity.node, modes: behavior.modes }}
        detailKey="entity"
        onChange={(next) => {
          edit(() => ({ ...next, "#tag": "af-entity" }));
        }}
      />
    );
  }
  const relationship = behavior.template === RELATIONSHIP_BEHAVIOR;
  return (
    <>
      <Picker
        id={`${id}-mode`}
        label={behavior.title}
        hiddenLabel
        placeholder={ts("None")}
        options={behavior.modes.map((mode) => ({
          id: mode.name,
          label: mode.label,
          icon: mode.icon,
          description: mode.description,
        }))}
        value={selected ? [selected] : []}
        single
        // deviation:relationship-autofill-clearable
        clearable={relationship || !behavior.default_mode}
        onChange={([mode]) => {
          edit((node) => withAttribute(editor.meta.types, node, behavior.key, mode ?? null));
        }}
      />
      {behavior.description && (!relationship || !selected) && (
        <p className="help-block">{behavior.description}</p>
      )}
      {relationship && selected.startsWith("relationship:") && (
        <RelationshipAutofill entity={entity} behavior={behavior} />
      )}
    </>
  );
}

/** The warning on a record any user can open by its id in the URL, in view while Options are shut. */
function exposureWarning(editor: EditorApi, entity: FormEntity) {
  const template = editor.meta.gui.entities[entity.type]?.options_tpl ?? GENERIC_OPTIONS;
  const exposed =
    template === GENERIC_OPTIONS &&
    textAttribute(entity.node, "url-autofill") === "1" &&
    !!entityActions(entity.node).update &&
    textAttribute(entity.node, "security") === "FBAC";
  if (!exposed) return null;
  return (
    <div className="description bg-warning">
      <i className="crm-i fa-warning" role="img" aria-hidden="true" />{" "}
      {ts(
        "Without Role-Based access, users of the form will be able to view and update any %1 by changing the id in the URL.",
        { 1: editor.meta.gui.entities[entity.type]?.label ?? entity.type },
      )}
    </div>
  );
}

/** What the options section holds while shut: security mode, actions, URL id and behaviors. */
function optionsSummary(editor: EditorApi, entity: FormEntity): string | undefined {
  const template = editor.meta.gui.entities[entity.type]?.options_tpl ?? GENERIC_OPTIONS;
  const actions = entityActions(entity.node);
  const names =
    template === GENERIC_OPTIONS
      ? { create: ts("Create"), update: ts("Update") }
      : template === GROUP_OPTIONS
        ? { create: ts("Subscribe"), update: ts("Unsubscribe") }
        : null;
  if (!names) return undefined;
  const security = textAttribute(entity.node, "security");
  const mode = SECURITY_MODES().find((each) => each.id === security);
  const parts = [
    template === GENERIC_OPTIONS ? mode?.label : undefined,
    ...(["create", "update"] as const).filter((key) => !!actions[key]).map((key) => names[key]),
    template === GENERIC_OPTIONS &&
    actions.update &&
    textAttribute(entity.node, "url-autofill") === "1"
      ? ts("ID from URL")
      : undefined,
    ...(editor.meta.behaviors[entity.type] ?? [])
      .filter((behavior) => !!textAttribute(entity.node, behavior.key))
      .map((behavior) => behavior.title),
  ];
  return parts.filter((part) => part !== undefined).join(" · ") || ts("None");
}

/** afGuiEntity: an entity's tab in the palette: its values and options, then its long add list. */
export function EntityTab({ entity, link }: { entity: FormEntity; link: string | null }) {
  const editor = useEditor();
  // deviation:behaviors-only-on-forms
  const configurable = editor.afform.type === "form" && entity.path !== null;
  const path = entity.path;
  const label = editor.meta.gui.entities[entity.type]?.label ?? entity.type;
  const [references, setReferences] = useState<string[] | null>(null);
  return (
    <form
      className="afreact-palette-sections"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <PanelHead
        icon={editor.meta.gui.entities[entity.type]?.icon ?? "fa-cube"}
        label={entity.label}
        renameLabel={ts("Label of %1", { 1: entity.name })}
        onRename={
          configurable && path
            ? (next) => {
                editor.change((afform) =>
                  editNode(afform, editor.meta, path, (node) => ({ ...node, label: next })),
                );
              }
            : undefined
        }
      >
        {configurable && (
          <button
            type="button"
            className="btn btn-sm btn-danger-outline af-gui-remove-entity"
            title={ts("Remove %1", { 1: label })}
            aria-label={ts("Remove %1", { 1: entity.label })}
            onClick={() => {
              // deviation:remove-entity-references
              const found = entityReferences(editor.afform, entity.name);
              if (found.length) setReferences(found);
              else editor.removeEntity(entity.name);
            }}
          >
            <i className="crm-i fa-trash" role="img" aria-hidden="true" />
          </button>
        )}
      </PanelHead>
      {references && (
        <ConfirmDialog
          title={ts("Remove %1", { 1: entity.label })}
          confirmLabel={ts("Remove")}
          onConfirm={() => {
            setReferences(null);
            editor.removeEntity(entity.name);
          }}
          onCancel={() => {
            setReferences(null);
          }}
        >
          <p>{ts("The form still refers to %1 here:", { 1: entity.name })}</p>
          <ul>
            {references.map((where) => (
              <li key={where}>
                <code>{where}</code>
              </li>
            ))}
          </ul>
          <p>{ts("These references stay and will point at nothing.")}</p>
        </ConfirmDialog>
      )}
      {editor.afform.type !== "block" && <EntityValues entity={entity} />}
      {configurable && (
        <PaletteSection
          name="entity-options"
          title={ts("Options")}
          summary={optionsSummary(editor, entity)}
          note={exposureWarning(editor, entity)}
        >
          <EntityOptions entity={entity} link={link} />
          {(editor.meta.behaviors[entity.type] ?? []).map((behavior) => (
            <fieldset key={behavior.key}>
              <legend>{behavior.title}</legend>
              <BehaviorSettings entity={entity} behavior={behavior} />
            </fieldset>
          ))}
        </PaletteSection>
      )}
      <EntityPalette entity={entity} />
    </form>
  );
}
