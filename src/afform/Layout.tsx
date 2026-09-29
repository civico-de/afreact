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
import { AfreactSearch } from "../search/AfreactSearch";
import { isDisplaySettings } from "../search/types";
import { checkConditions, parseConditions } from "./conditions";
import { interpolate, type ExpressionContext } from "./expressions";
import { ClearButton, Field, fieldClasses } from "./Field";
import {
  addRepeatItem,
  copyRepeatItem,
  deleteValue,
  getValue,
  keepOffered,
  removeRepeatItem,
  repeatCount,
  setPrimary,
  setValue,
  type EntityDeclaration,
} from "./model";
import {
  defaultValue,
  hasTokens,
  initialiseNodes,
  refersToItself,
  replaceTokens,
  tokenValues,
} from "./structure";
import type { ElementNode, FieldDefn, FormData, LayoutNode, Scope } from "./types";
import { isElement, isFieldDefn } from "./types";
import { Unsupported } from "./Unsupported";

export interface FormState {
  data: FormData;
  update: (change: (data: FormData) => FormData) => void;
  disabled: boolean;
  joinOffsets: WeakMap<ElementNode, number>;
  entities: Record<string, EntityDeclaration>;
  formName: string;
  /** afForm hides the submit button when the route opens a stored submission (sid). */
  showSubmitButton: boolean;
  expressions: ExpressionContext;
}

export const FormContext = createContext<FormState | null>(null);
const ScopeContext = createContext<Scope | null>(null);
/**
 * Inside an af-if that turned false: the data it last rendered with. Fields drop their values
 * as on afIfDestroy; a nested af-if renders what it showed then.
 */
const HiddenContext = createContext<FormData | null>(null);

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
/** Tags React refuses children for, even an empty list. */
const VOID_TAGS = new Set(["br", "hr"]);
/** Attributes the renderer interprets itself; other ng-*, af-* and crm-* attributes are reported. */
const HANDLED = new Set([
  "af-if",
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
  "ng-href",
]);
/** af-field attributes the renderer uses; `class` goes onto the field wrapper. */
const FIELD_ATTRIBUTES = new Set([
  "#tag",
  "#children",
  "name",
  "defn",
  "class",
  "af-required",
  "af-disabled",
  "af-if",
]);
const PASSTHROUGH = new Set(["id", "href", "title", "role", "target", "type"]);

export function Nodes({ nodes }: { nodes: LayoutNode[] }): ReactNode {
  return nodes.map((node, index) => <Node key={index} node={node} />);
}

function Node({ node }: { node: LayoutNode }): ReactNode {
  if (!isElement(node)) {
    if ("#comment" in node) return null;
    // CRM_Afform_ArrayHtml writes non-breaking spaces as the entity.
    return <Text text={node["#text"].replaceAll("&nbsp;", "\u00a0")} />;
  }
  if (typeof node["af-if"] === "string") return <Conditional node={node} />;
  if (node["ng-if"] === SUBMIT_BUTTON_CONDITION) return <SubmitButtonCondition node={node} />;
  return <Rendered node={node} />;
}

const SUBMIT_BUTTON_CONDITION = "afform.showSubmitButton";

/** An element whose af-if or submit-button condition holds; the node itself goes on, so lookups by node still match. */
function Rendered({ node }: { node: ElementNode }): ReactNode {
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
    (attr) =>
      /^(ng|af|crm)-/.test(attr) &&
      !HANDLED.has(attr) &&
      !(attr === "ng-if" && node[attr] === SUBMIT_BUTTON_CONDITION),
  );
  if (node["ng-click"] !== undefined) unknown.push(`ng-click=${JSON.stringify(node["ng-click"])}`);
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

function Text({ text }: { text: string }) {
  const form = useForm();
  if (!text.includes("{{")) return text;
  const result = interpolate(text, form.expressions);
  return "text" in result ? (
    result.text
  ) : (
    <Unsupported what={`Angular expression ${result.unsupported}`} />
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
  for (const [attr, value] of Object.entries(node)) {
    if (attr === "class") props.className = resolve(value);
    else if (attr === "ng-href") props.href = resolve(value);
    else if (PASSTHROUGH.has(attr) || attr.startsWith("aria-")) props[attr] = resolve(value);
  }
  // afTitle's elements.
  const resolvedTitle = resolve(node["af-title"]);
  const title = typeof resolvedTitle === "string" ? resolvedTitle : null;
  const legend =
    title && node["#tag"] === "fieldset" ? (
      <legend className="af-title">{title}</legend>
    ) : title ? (
      <h4 className="af-title">{title}</h4>
    ) : null;
  const note = unsupported.length > 0 && (
    <Unsupported what={`Angular expression ${unsupported.join(", ")}`} />
  );
  if (VOID_TAGS.has(node["#tag"]))
    return (
      <>
        {note}
        {createElement(node["#tag"], props)}
      </>
    );
  return createElement(
    node["#tag"],
    props,
    note,
    legend,
    children ?? <Nodes nodes={node["#children"] ?? []} />,
  );
}

type Evaluated = { value: boolean } | { error: string };

function evaluateConditions(attribute: string, data: FormData, name: string): Evaluated {
  try {
    return { value: checkConditions(parseConditions(attribute), data) };
  } catch {
    return { error: `${name}="${attribute}"` };
  }
}

/**
 * afIf: the element renders while its conditions hold, and whatever it renders initialises
 * its data then. Once hidden again, its subtree renders off-document so every field inside
 * drops its value, as on afIfDestroy. A condition that cannot be read renders nothing.
 */
function Conditional({ node }: { node: ElementNode }) {
  const form = useForm();
  const { update, joinOffsets } = form;
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
    update((current) => initialiseNodes([node], current, scope, joinOffsets));
  }, [active, update, node, scope, joinOffsets]);
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

/**
 * A stable key per repeat item, as ng-repeat tracks items by identity: removing an item
 * keeps the state of the items after it.
 */
function useItemKeys(count: number): [number[], (position: number) => void] {
  const [keys, setKeys] = useState(() => Array.from({ length: count }, (_, key) => key));
  let current = keys;
  if (keys.length !== count) {
    current = keys.slice(0, count);
    for (let key = Math.max(-1, ...keys) + 1; current.length < count; key++) current.push(key);
    setKeys(current);
  }
  const remove = (position: number) => {
    setKeys((previous) => previous.filter((_, index) => index !== position));
  };
  return [current, remove];
}

/** af-repeat in afRepeat.html's markup: one copy of the children per item, with add/copy/remove inside the min/max bounds. */
function Repeat({ node, scope, itemScope, count }: RepeatProps) {
  const form = useForm();
  const [keys, removeKey] = useItemKeys(count);
  // Same bounds as afRepeat's canAdd/canRemove: no min means every item can go.
  const min = Number(node.min ?? 0);
  const max = Number(node.max ?? 0);
  const text = (attr: string) => (typeof node[attr] === "string" ? node[attr] : "");
  const addLabel = text("af-repeat") || ts("Add");
  const canAdd = !max || count < max;
  const children = node["#children"] ?? [];
  // A new item's fields and repeats initialise as afField and afRepeat do on render.
  const initialiseLast = (data: FormData) =>
    initialiseNodes(children, data, itemScope(repeatCount(data, scope) - 1), form.joinOffsets);
  const items = keys.map((key, position) => (
    <div af-repeat-item="" key={key}>
      <ScopeContext.Provider value={itemScope(position)}>
        <Nodes nodes={children} />
      </ScopeContext.Provider>
      {count > min && (
        <button
          type="button"
          className="btn btn-xs af-repeat-remove-btn"
          disabled={form.disabled}
          onClick={() => {
            removeKey(position);
            form.update((data) => removeRepeatItem(data, scope, position));
          }}
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
          onClick={() => {
            form.update((data) => initialiseLast(addRepeatItem(data, scope)));
          }}
        >
          <i className={`crm-i ${text("add-icon") || "fa-plus"}`} aria-hidden="true" /> {addLabel}
        </button>
      )}
      {canAdd && text("af-copy") && count > 0 && (
        <button
          type="button"
          className="btn btn-sm af-repeat-copy-btn"
          disabled={form.disabled}
          onClick={() => {
            form.update((data) => initialiseLast(copyRepeatItem(data, scope)));
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
  const scope = useContext(ScopeContext);
  const hidden = useContext(HiddenContext);
  const defn = node.defn;
  const name = String(node.name);
  if (!scope || !isFieldDefn(defn))
    return <Unsupported what={`field ${name} without entity or metadata`} />;
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
  const calculatedFor = useRef<string | null>(null);
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
    if (template === null || loops || touched.current || calculatedFor.current === tokens) return;
    calculatedFor.current = tokens;
    update((data) =>
      setValue(data, scope, name, defaultValue(given, replaceTokens(template, data))),
    );
  }, [template, loops, tokens, update, scope, name, given]);
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
    ...Object.keys(node).filter((attr) => !FIELD_ATTRIBUTES.has(attr)),
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
      name,
      className:
        `${primary ? "af-field-type-radio" : fieldClasses(defn)} ${typeof node.class === "string" ? node.class : ""}`.trim(),
    },
    unknown.length > 0 && <Unsupported what={`${unknown.join(", ")} on ${name}`} />,
    primary ? (
      <PrimaryField
        label={typeof defn.label === "string" && defn.label !== "" ? defn.label : ts("Primary")}
        group={`${form.formName}-${scope.entity}-${scope.index}-${scope.join ?? ""}`}
        checked={value === true}
        disabled={form.disabled || conditionallyDisabled}
        onSelect={() => {
          form.update((data) => setPrimary(data, scope));
        }}
        onClear={() => {
          form.update((data) => setValue(data, scope, name, null));
        }}
      />
    ) : (
      <Field
        defn={defn}
        value={value}
        disabled={form.disabled || readonly || conditionallyDisabled}
        onChange={(next) => {
          form.update((data) => setValue(data, scope, name, next));
        }}
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
      className={typeof node.class === "string" ? node.class : "btn btn-primary"}
      disabled={form.disabled}
    >
      {icon && <i className={`crm-i ${icon}`} aria-hidden="true" />}{" "}
      <Nodes nodes={node["#children"] ?? []} />
    </button>
  );
}

function SearchNode({ node }: { node: ElementNode }) {
  const form = useForm();
  // A display under a hidden af-if loads nothing.
  if (useContext(HiddenContext) !== null) return null;
  const settings = node.settings;
  if (settings !== undefined && !isDisplaySettings(settings))
    return <Unsupported what="search display settings without columns" />;
  // Angular expressions the display element takes from the page (routeParams, options).
  const bound = ["filters", "total-count"].filter((attr) => node[attr] !== undefined);
  return (
    <>
      {bound.length > 0 && (
        <Unsupported what={bound.map((attr) => `${attr}="${String(node[attr])}"`).join(", ")} />
      )}
      <AfreactSearch
        search={String(node["search-name"])}
        display={String(node["display-name"])}
        settings={settings}
        afform={form.formName}
      />
    </>
  );
}
