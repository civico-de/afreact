import { useEffect, useId, useRef, useState } from "react";
import { NgElement } from "../../widgets/NgElement";
import { InlineEdit } from "../../widgets/InlineEdit";
import { useEditor, type EditorApi } from "../context";
import type { Literal } from "../literal";
import type { GuiEntity, GuiField, SearchDisplayMeta } from "../meta";
import { textAttribute } from "../model";
import { formTokens } from "../tokens";
import { RichTextInput, type RichTextElement } from "./Content";
import {
  DeleteAction,
  ElementBar,
  GearMenu,
  useNodeOps,
  type ElementProps,
  type NodeOps,
} from "./common";
import type { ContainerScope } from "./dropRules";
import { EditOptions } from "./EditOptions";
import { FieldMenu } from "./FieldMenu";
import { InputPreview } from "./FieldInputs";
import {
  baseDefn,
  getProp,
  getValue,
  localDefn,
  mergedDefn,
  optionList,
  propIsset,
  setValue,
  showLabel,
  withDefn,
  type FieldOption,
  type FieldState,
} from "./fieldModel";
import { knownEntityType, scopeSearchDisplay } from "./scope";
import { FormTokenSelect } from "./TokenSelect";

/** What the field element and its menu share: core's afGuiField controller. */
export interface FieldApi {
  editor: EditorApi;
  ops: NodeOps;
  scope: ContainerScope;
  state: FieldState;
  /** setFieldDefn(): the metadata with the element's defn merged in. */
  defn: Record<string, unknown>;
  /** getSet() as a setter: one undo step. */
  set: (prop: string, value: Literal | undefined) => void;
  update: (change: (state: FieldState) => FieldState) => void;
  hasDefault: boolean;
  toggleDefault: () => void;
  setHasDefault: (on: boolean) => void;
  /** getOptions(): the element's own options, or the field's. */
  options: FieldOption[] | null;
  originalOptions: FieldOption[] | null;
  display: SearchDisplayMeta | undefined;
  fkEntity: GuiEntity | undefined;
  /** An id prefix for the field's controls. */
  fieldId: string;
  editOptions: () => void;
}

const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

const yesNo = (): FieldOption[] => [
  { id: true, label: ts("Yes") },
  { id: false, label: ts("No") },
];

const CONTACT_TYPES = ["Individual", "Household", "Organization"];

/** getOriginalOptions(): the form's entities for a reference, date ranges, or the field's. */
function originalOptions(editor: EditorApi, state: FieldState): FieldOption[] | null {
  const { base } = state;
  if (base.input_type === "EntityRef") {
    const fk = base.fk_entity ?? "";
    const types = fk === "Contact" ? CONTACT_TYPES : [fk];
    return editor.entities
      .filter((entity) => types.includes(entity.type))
      .map((entity) => ({ id: entity.name, label: entity.label }));
  }
  if (["Date", "Timestamp"].includes(String(getProp(state, "data_type")))) {
    const ranges = editor.meta.gui.dateRanges;
    return getProp(state, "search_range") ? ranges : ranges.slice(1);
  }
  if (base.options) return base.options;
  return base.data_type === "Boolean" ? yesNo() : null;
}

/** The merged definition as the value inputs read field metadata. */
export function guiField(defn: Record<string, unknown>, name: string): GuiField {
  const nullableText = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    ...defn,
    name,
    label: nullableText(defn.label),
    input_type: nullableText(defn.input_type),
    data_type: nullableText(defn.data_type),
    fk_entity: nullableText(defn.fk_entity),
    options: optionList(defn.options) ?? false,
    required: !!defn.required,
  };
}

/** A local flag for one field, dropped when another field takes the element's place. */
function useFlag(owner: string): [boolean, (on: boolean) => void] {
  const [flag, setFlag] = useState<string | null>(null);
  return [
    flag === owner,
    (on) => {
      setFlag(on ? owner : null);
    },
  ];
}

function useFieldApi(
  editor: EditorApi,
  ops: NodeOps,
  scope: ContainerScope,
  state: FieldState,
): FieldApi & { editingOptions: boolean; closeOptions: () => void } {
  const owner = textAttribute(ops.node, "name") ?? "";
  const fieldId = useId();
  const [pendingDefault, setPendingDefault] = useFlag(owner);
  const [editingOptions, setEditingOptions] = useFlag(owner);
  const hasDefault = !!getValue(state, "afform_default") || pendingDefault;
  const update = (change: (state: FieldState) => FieldState) => {
    ops.edit((node) => {
      const local = localDefn(node);
      if (!local) throw new Error(ts("The settings of field %1 cannot be read.", { 1: owner }));
      return withDefn(node, change({ ...state, local }).local);
    });
  };
  const set = (prop: string, value: Literal | undefined) => {
    update((current) => setValue(current, prop, value, hasDefault));
  };
  const defn = mergedDefn(state);
  const original = originalOptions(editor, state);
  const fk = state.base.fk_entity;
  return {
    editor,
    ops,
    scope,
    state,
    defn,
    set,
    update,
    hasDefault,
    setHasDefault: setPendingDefault,
    toggleDefault: () => {
      if (hasDefault) {
        set("afform_default", undefined);
        setPendingDefault(false);
        return;
      }
      setPendingDefault(true);
      // A yes/no field has no options to pick its default from.
      if (state.base.data_type === "Boolean") set("afform_default", true);
    },
    options: optionList(defn.options) ?? original,
    originalOptions: original,
    display: scopeSearchDisplay(editor, scope),
    fkEntity: fk ? editor.meta.gui.entities[fk] : undefined,
    fieldId,
    editOptions: () => {
      setEditingOptions(true);
    },
    editingOptions,
    closeOptions: () => {
      setEditingOptions(false);
    },
  };
}

/** getOriginalLabel(): the field's entity and its metadata label, for the bar's tooltip. */
function originalLabel(editor: EditorApi, scope: ContainerScope, state: FieldState) {
  if (!state.fieldName) {
    const type = editor.meta.gui.inputTypes.find((each) => each.name === state.local.input_type);
    return type ? ts("Extra %1", { 1: type.label }) : ts("Extra Field");
  }
  const label = text(state.base.label);
  if (scope.entityName) {
    const [name = ""] = scope.entityName.split("-join-");
    const entity = editor.entities.find((each) => each.name === name);
    return `${entity?.label ?? name}: ${label}`;
  }
  const type = knownEntityType(editor, scope, state.fieldName);
  const entity = type === undefined ? undefined : editor.meta.gui.entities[type];
  return `${entity?.label ?? type ?? ""}: ${label}`;
}

/** A help text above or below the field, edited with the site's editor. */
function HelpText({ api, position }: { api: FieldApi; position: "pre" | "post" }) {
  const element = useRef<RichTextElement | null>(null);
  const prop = `help_${position}`;
  return (
    <div className="af-gui-field-help">
      <RichTextInput
        value={text(getProp(api.state, prop))}
        elementRef={element}
        tokens={() => formTokens(api.editor, false)}
        onChange={(value) => {
          api.set(prop, value);
        }}
      />
    </div>
  );
}

/** A field whose own settings or metadata cannot be read: named, and only removable. */
function BrokenField({
  ops,
  handle,
  label,
  message,
}: Pick<ElementProps, "handle" | "label"> & { ops: NodeOps; message: string }) {
  return (
    <div className="af-gui-element af-gui-field">
      <ElementBar handle={handle} label={label}>
        <div className="form-inline">
          <GearMenu alignRight>
            {() => <DeleteAction ops={ops} label={ts("Remove field")} />}
          </GearMenu>
        </div>
      </ElementBar>
      <div className="form-inline">
        <span className="crm-error">{message}</span>
      </div>
    </div>
  );
}

/** afGuiField: a field's label, help and input, its settings in the gear menu. */
export function FieldElement({ path, node, scope, handle, label }: ElementProps) {
  const editor = useEditor();
  const ops = useNodeOps(path, node);
  const local = localDefn(node);
  const name = textAttribute(node, "name") ?? "";
  const fieldName = name.split(",")[0]?.split(":")[0] ?? "";
  const entityType = fieldName ? knownEntityType(editor, scope, fieldName) : undefined;
  const base =
    local &&
    baseDefn(editor.meta, node, entityType, scopeSearchDisplay(editor, scope)?.calc_fields, local);
  if (!local)
    return (
      <BrokenField
        ops={ops}
        handle={handle}
        label={label}
        message={ts("The settings of field %1 cannot be read; saving keeps them unchanged.", {
          1: name,
        })}
      />
    );
  if (!base)
    return (
      <BrokenField
        ops={ops}
        handle={handle}
        label={label}
        message={ts('Error: missing field "%1"', { 1: name })}
      />
    );
  const state: FieldState = { base, local, isSearch: editor.afform.type === "search", fieldName };
  return (
    <Field editor={editor} ops={ops} scope={scope} state={state} handle={handle} label={label} />
  );
}

function Field({
  editor,
  ops,
  scope,
  state,
  handle,
  label,
}: Pick<ElementProps, "handle" | "label"> & {
  editor: EditorApi;
  ops: NodeOps;
  scope: ContainerScope;
  state: FieldState;
}) {
  const api = useFieldApi(editor, ops, scope, state);
  const element = useRef<HTMLDivElement>(null);
  const returning = useRef(false);
  useEffect(() => {
    // Back from the options, focus goes to the field's menu button, which closing removed.
    if (api.editingOptions || !returning.current) return;
    returning.current = false;
    element.current?.querySelector<HTMLElement>(".af-gui-bar .dropdown-toggle")?.focus();
  });
  if (api.editingOptions)
    return (
      <NgElement tag="af-gui-field">
        <EditOptions
          api={api}
          onClose={() => {
            returning.current = true;
            api.closeOptions();
          }}
        />
      </NgElement>
    );
  const fieldLabel = text(getProp(state, "label"));
  return (
    <NgElement tag="af-gui-field">
      <div ref={element} className="af-gui-element af-gui-field">
        <ElementBar handle={handle} label={label} title={originalLabel(editor, scope, state)}>
          <div className="form-inline">
            <GearMenu alignRight>{(close) => <FieldMenu api={api} close={close} />}</GearMenu>
          </div>
        </ElementBar>
        {showLabel(state) && (
          <div className="af-gui-node-title">
            <label className={getProp(state, "required") ? "af-gui-field-required" : undefined}>
              <InlineEdit
                label={ts("Field label")}
                value={fieldLabel}
                defaultValue={text(state.base.label)}
                onChange={(value) => {
                  api.set("label", value);
                }}
              />{" "}
            </label>
            <FormTokenSelectFor api={api} />
          </div>
        )}
        {propIsset(state, "help_pre") && <HelpText api={api} position="pre" />}
        <div
          className={`af-gui-field-input af-gui-field-input-type-${text(getProp(state, "input_type")).toLowerCase()}`}
        >
          <InputPreview api={api} />
        </div>
        {propIsset(state, "help_post") && <HelpText api={api} position="post" />}
      </div>
    </NgElement>
  );
}

function FormTokenSelectFor({ api }: { api: FieldApi }) {
  return (
    <FormTokenSelect
      className="afreact-label-token"
      value={text(getValue(api.state, "label"))}
      onChange={(value) => {
        api.set("label", value);
      }}
    />
  );
}
