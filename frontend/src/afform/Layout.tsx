import { createContext, createElement, useContext, useId, type ReactNode } from "react";
import { FacadeSearch, type DisplaySettings } from "../search/FacadeSearch";
import { ClearButton, Field, fieldClasses } from "./Field";
import {
  addRepeatItem,
  copyRepeatItem,
  getValue,
  removeRepeatItem,
  repeatCount,
  setPrimary,
  setValue,
  type EntityDeclaration,
} from "./model";
import type { ElementNode, FieldDefn, FormData, LayoutNode, Scope } from "./types";
import { isElement } from "./types";
import { Unsupported } from "./Unsupported";

export interface FormState {
  data: FormData;
  update: (change: (data: FormData) => FormData) => void;
  disabled: boolean;
  joinOffsets: WeakMap<ElementNode, number>;
  entities: Record<string, EntityDeclaration>;
  formName: string;
}

export const FormContext = createContext<FormState | null>(null);
const ScopeContext = createContext<Scope | null>(null);

function useForm(): FormState {
  const form = useContext(FormContext);
  if (!form) throw new Error("Layout rendered outside a FormContext");
  return form;
}

/** Plain HTML the layout may contain; anything else with a dash is an unknown directive. */
const HTML_TAGS = new Set([
  "div",
  "span",
  "p",
  "fieldset",
  "section",
  "article",
  "header",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "small",
  "br",
  "hr",
  "ul",
  "ol",
  "li",
  "a",
  "label",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);
/** Attributes the renderer interprets itself; other ng-*, af-* and crm-* attributes are reported. */
const HANDLED = new Set([
  "api-entities",
  "af-fieldset",
  "af-join",
  "af-repeat",
  "af-repeat-default",
  "af-title",
  "af-copy",
  "add-icon",
  "copy-icon",
  "min",
  "max",
  "actions",
  "data",
  "crm-icon",
  "ng-click",
  "ctrl",
  "ng-form",
]);
/** af-field attributes the renderer uses; `class` goes onto the field wrapper. */
const FIELD_ATTRIBUTES = new Set(["#tag", "#children", "name", "defn", "class"]);
const PASSTHROUGH = new Set(["id", "href", "title", "role", "target", "type"]);

export function Nodes({ nodes }: { nodes: LayoutNode[] }): ReactNode {
  return nodes.map((node, index) => <Node key={index} node={node} />);
}

function Node({ node }: { node: LayoutNode }): ReactNode {
  if (!isElement(node)) {
    if ("#comment" in node) return null;
    return node["#text"].includes("{{") ? (
      <Unsupported what={`Angular expression ${node["#text"].trim()}`} />
    ) : (
      // CRM_Afform_ArrayHtml writes non-breaking spaces as the entity.
      node["#text"].replaceAll("&nbsp;", "\u00a0")
    );
  }
  const tag = node["#tag"];
  if (tag === "af-entity") return null;
  if (tag === "af-field") return <FieldNode node={node} />;
  // Blocks arrive with their compiled layout as children.
  if (tag.startsWith("afblock-")) return <Nodes nodes={node["#children"] ?? []} />;
  if (tag === "af-form") return <Nodes nodes={node["#children"] ?? []} />;
  if (tag === "button" && node["ng-click"] === "afform.submit()")
    return <SubmitButton node={node} />;
  if (tag === "crm-search-display-table") return <SearchNode node={node} />;

  const unknown = Object.keys(node).filter(
    (attr) => /^(ng|af|crm)-/.test(attr) && !HANDLED.has(attr),
  );
  if (node["ng-click"] !== undefined) unknown.push(`ng-click="${String(node["ng-click"])}"`);
  if (!HTML_TAGS.has(tag) || unknown.length) {
    return (
      <>
        <Unsupported what={HTML_TAGS.has(tag) ? unknown.join(", ") : `<${tag}>`} />
        <Nodes nodes={node["#children"] ?? []} />
      </>
    );
  }
  // An empty af-fieldset wraps a search page's filters rather than an entity.
  if (node["af-fieldset"]) return <FieldsetNode node={node} />;
  if (typeof node["af-join"] === "string") return <JoinNode node={node} />;
  return <Element node={node} />;
}

function Element({ node, children }: { node: ElementNode; children?: ReactNode }) {
  const props: Record<string, unknown> = {};
  for (const [attr, value] of Object.entries(node)) {
    if (attr === "class") props.className = value;
    else if (PASSTHROUGH.has(attr) || attr.startsWith("aria-")) props[attr] = value;
  }
  // afTitle's elements.
  const title = typeof node["af-title"] === "string" ? node["af-title"] : null;
  const legend =
    title && node["#tag"] === "fieldset" ? (
      <legend className="af-title">{title}</legend>
    ) : title ? (
      <h4 className="af-title">{title}</h4>
    ) : null;
  return createElement(
    node["#tag"],
    props,
    legend,
    children ?? <Nodes nodes={node["#children"] ?? []} />,
  );
}

function FieldsetNode({ node }: { node: ElementNode }) {
  const form = useForm();
  const entity = String(node["af-fieldset"]);
  if (node["af-repeat"] === undefined) {
    return (
      <ScopeContext.Provider value={{ entity, index: 0 }}>
        <Element node={node} />
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

function JoinNode({ node }: { node: ElementNode }) {
  const form = useForm();
  const parent = useContext(ScopeContext);
  if (!parent)
    return <Unsupported what={`af-join="${String(node["af-join"])}" outside a fieldset`} />;
  const scope = { entity: parent.entity, index: parent.index, join: String(node["af-join"]) };
  if (node["af-repeat"] === undefined) {
    return (
      <ScopeContext.Provider value={{ ...scope, joinIndex: form.joinOffsets.get(node) ?? 0 }}>
        <Element node={node} />
      </ScopeContext.Provider>
    );
  }
  return (
    <Repeat
      node={node}
      scope={scope}
      itemScope={(joinIndex) => ({ ...scope, joinIndex, repeated: true })}
      count={repeatCount(form.data, scope)}
    />
  );
}

interface RepeatProps {
  node: ElementNode;
  scope: Scope;
  itemScope: (position: number) => Scope;
  count: number;
}

/** af-repeat in afRepeat.html's markup: one copy of the children per item, with add/copy/remove inside the min/max bounds. */
function Repeat({ node, scope, itemScope, count }: RepeatProps) {
  const form = useForm();
  // Same bounds as afRepeat's canAdd/canRemove: no min means every item can go.
  const min = Number(node.min ?? 0);
  const max = Number(node.max ?? 0);
  const text = (attr: string) => (typeof node[attr] === "string" ? node[attr] : "");
  const addLabel = text("af-repeat") || ts("Add");
  const canAdd = !max || count < max;
  const items = Array.from({ length: count }, (_, position) => (
    <div af-repeat-item="" key={position}>
      <ScopeContext.Provider value={itemScope(position)}>
        <Nodes nodes={node["#children"] ?? []} />
      </ScopeContext.Provider>
      {count > min && (
        <button
          type="button"
          className="btn btn-xs af-repeat-remove-btn"
          disabled={form.disabled}
          onClick={() => form.update((data) => removeRepeatItem(data, scope, position))}
        >
          <i className="crm-i fa-ban" aria-hidden="true" />
          <span className="sr-only">{ts("Remove")}</span>
        </button>
      )}
    </div>
  ));
  return (
    <Element node={node}>
      {items}
      {canAdd && (
        <button
          type="button"
          className="btn btn-sm af-repeat-add-btn"
          disabled={form.disabled}
          onClick={() => form.update((data) => addRepeatItem(data, scope))}
        >
          <i className={`crm-i ${text("add-icon") || "fa-plus"}`} aria-hidden="true" /> {addLabel}
        </button>
      )}
      {canAdd && text("af-copy") && count > 0 && (
        <button
          type="button"
          className="btn btn-sm af-repeat-copy-btn"
          disabled={form.disabled}
          onClick={() => form.update((data) => copyRepeatItem(data, scope))}
        >
          <i className={`crm-i ${text("copy-icon") || "fa-copy"}`} aria-hidden="true" />{" "}
          {text("af-copy")}
        </button>
      )}
    </Element>
  );
}

function FieldNode({ node }: { node: ElementNode }) {
  const form = useForm();
  const scope = useContext(ScopeContext);
  const defn = node.defn as FieldDefn | undefined;
  const name = String(node.name);
  if (!scope || !defn?.input_type)
    return <Unsupported what={`field ${name} without entity or metadata`} />;
  // Conditions (af-if, af-required, af-disabled) are evaluated live by Angular; afField reads no other attributes.
  const unknown = Object.keys(node).filter((attr) => !FIELD_ATTRIBUTES.has(attr));
  const value = getValue(form.data, scope, name);
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
      name,
      className:
        `${primary ? "af-field-type-radio" : fieldClasses(defn)} ${typeof node.class === "string" ? node.class : ""}`.trim(),
    },
    unknown.length > 0 && <Unsupported what={`${unknown.join(", ")} on ${name}`} />,
    primary ? (
      <PrimaryField
        label={defn.label || ts("Primary")}
        group={`${form.formName}-${scope.entity}-${scope.index}-${scope.join ?? ""}`}
        checked={value === true}
        disabled={form.disabled}
        onSelect={() => form.update((data) => setPrimary(data, scope))}
        onClear={() => form.update((data) => setValue(data, scope, name, null))}
      />
    ) : (
      <Field
        defn={defn}
        value={value}
        disabled={form.disabled || readonly}
        onChange={(next) => form.update((data) => setValue(data, scope, name, next))}
      />
    ),
  );
}

interface PrimaryFieldProps {
  label: string;
  group: string;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
  onClear: () => void;
}

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

function SubmitButton({ node }: { node: ElementNode }) {
  const form = useForm();
  const icon = typeof node["crm-icon"] === "string" ? node["crm-icon"] : null;
  return (
    <button
      type="submit"
      className={String(node.class ?? "btn btn-primary")}
      disabled={form.disabled}
    >
      {icon && <i className={`crm-i ${icon}`} aria-hidden="true" />}{" "}
      <Nodes nodes={node["#children"] ?? []} />
    </button>
  );
}

function SearchNode({ node }: { node: ElementNode }) {
  const form = useForm();
  return (
    <FacadeSearch
      search={String(node["search-name"])}
      display={String(node["display-name"])}
      settings={node.settings as DisplaySettings | undefined}
      afform={form.formName}
    />
  );
}
