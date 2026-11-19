import { useId, useState } from "react";
import { parseRowConditions, parseToken, ROW_CONDITIONS } from "../../../afform/rowConditions";
import {
  allowedOperators,
  withOperator,
  type ConditionField,
  type Operator,
} from "../../search/condition";
import { ClauseMoveButtons } from "../../widgets/ClauseMove";
import { clausePath, isClauseGroup, type ClausePath } from "../../widgets/clauseTree";
import { Dialog } from "../../widgets/Dialog";
import { NgElement } from "../../widgets/NgElement";
import { Picker, type PickerOption } from "../../widgets/Picker";
import { TabList, TabPanel } from "../../widgets/Tabs";
import { useEditor, type EditorApi } from "../context";
import { entityFields, withoutDefnKey } from "../fields";
import { FieldValue } from "../FieldValue";
import type { GuiField } from "../meta";
import { textAttribute } from "../model";
import { withoutAttributes } from "../nodes";
import { isElement, nodeAt, type NodePath, type ShallowElement, type ShallowNode } from "../tree";
import { MenuAction, type NodeOps } from "./common";

export type Rule = "af-if" | "af-required" | "af-disabled";
const RULES: Rule[] = ["af-if", "af-required", "af-disabled"];

const ruleText = (rule: Rule) =>
  ({
    "af-if": { title: ts("Visibility"), description: ts("Element will be shown if...") },
    "af-required": { title: ts("Required"), description: ts("Element will be required if...") },
    "af-disabled": { title: ts("Disabled"), description: ts("Element will be disabled if...") },
  })[rule];

const conjunctions = (): Record<string, string> => ({
  AND: ts("And"),
  OR: ts("Or"),
  NOT: ts("Not"),
});

/** afGuiCondition's operators, in its order. */
const operators = (): Operator[] =>
  Object.entries({
    "=": "=",
    "!=": "≠",
    ">": ">",
    "<": "<",
    ">=": "≥",
    "<=": "≤",
    CONTAINS: ts("Contains"),
    "NOT CONTAINS": ts("Doesn't Contain"),
    IN: ts("Is One Of"),
    "NOT IN": ts("Not One Of"),
    BETWEEN: ts("Is Between"),
    "NOT BETWEEN": ts("Not Between"),
    LIKE: ts("Is Like"),
    "NOT LIKE": ts("Not Like"),
    "IS EMPTY": ts("Is Empty"),
    "IS NOT EMPTY": ts("Not Empty"),
    "IS NOT NULL": ts("Any Value"),
    "IS NULL": ts("No Value"),
  }).map(([key, value]) => ({ key, value }));

const hasRules = (node: ShallowElement) =>
  RULES.some((rule) => !!textAttribute(node, rule) || !!textAttribute(node, ROW_CONDITIONS[rule]));

/** afGuiConditionalMenu: the entry opening the conditional rules of an element. */
export function ConditionalMenuItem({
  ops,
  readOnlyField,
}: {
  ops: NodeOps;
  readOnlyField: boolean;
}) {
  const editor = useEditor();
  const has = hasRules(ops.node);
  return (
    <MenuAction
      onClick={() => {
        openConditionalDialog(editor, ops, readOnlyField);
      }}
    >
      <i className={`crm-i fa-code-fork${has ? "" : " disabled"}`} role="img" aria-hidden="true" />{" "}
      {has ? <strong>{ts("Edit Conditional Rules")}</strong> : ts("Add Conditional Rules")}
    </MenuAction>
  );
}

/** The conditional rules dialog, opened at `rule` where the element has it. */
export function openConditionalDialog(
  editor: EditorApi,
  ops: NodeOps,
  readOnlyField: boolean,
  rule?: Rule,
) {
  editor.openDialog((close) => (
    <ConditionalDialog ops={ops} readOnlyField={readOnlyField} rule={rule} close={close} />
  ));
}

/** A rule's conditions; null where the attribute holds something else, which stays as it is. */
export function parseRule(text: string | undefined): unknown[] | null {
  if (!text) return [];
  // deviation:condition-rules-plain-json
  // Core's builder writes the quotes as entities, which the stored markup then escapes again.
  const raw = text.replaceAll("&quot;", '"').trim();
  if (!raw.startsWith("(") || !raw.endsWith(")")) return null;
  try {
    const parsed: unknown = JSON.parse(raw.slice(1, -1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** `Individual1[0][joins][Email][1][email]` as the token `[Individual1.0.Email.1.email]`. */
const PATH = /^([A-Za-z0-9_]+)\[(\d+)\]\[fields\]\[([^\]]+)\]$/;
const JOIN_PATH = /^([A-Za-z0-9_]+)\[(\d+)\]\[joins\]\[([A-Za-z0-9_]+)\]\[(\d+)\]\[([^\]]+)\]$/;

export function pathToken(key: string): string {
  const join = JOIN_PATH.exec(key);
  if (join) return `[${join.slice(1).join(".")}]`;
  const field = PATH.exec(key);
  return field ? `[${field.slice(1).join(".")}]` : key;
}

/** A token as core's data path, or as it is where it names the element's own row (`@`). */
function tokenPath(text: string): string {
  const token = parseToken(text);
  if (!token || token.index === "@" || token.join?.index === "@") return text;
  const { entity, index, join, field } = token;
  return join
    ? `${entity}[${String(index)}][joins][${join.name}][${String(join.index)}][${field}]`
    : `${entity}[${String(index)}][fields][${field}]`;
}

/** Maps every clause of a condition list, groups included. */
function mapClauses(list: unknown[], map: (clause: unknown[]) => unknown[]): unknown[] {
  return list.map((clause) => {
    if (!Array.isArray(clause)) return clause;
    return isClauseGroup(clause) ? [clause[0], mapClauses(clause[1], map)] : map(clause);
  });
}

/** Whether a rule needs afreact's syntax: a field of the element's own row, or a field as value. */
function usesRowSyntax(list: unknown[]): boolean {
  return list.some((clause) => {
    if (!Array.isArray(clause)) return false;
    if (isClauseGroup(clause)) return usesRowSyntax(clause[1]);
    const { value } = parseValue(clause[2]);
    return parseToken(clause[0]) !== null || parseToken(value) !== null;
  });
}

/** afreact's attribute as the dialog edits it: core's data paths and JSON text values. */
function fromRowSyntax(text: string | undefined): unknown[] | null {
  if (!text) return [];
  try {
    const list = parseRowConditions(text);
    // A single clause or group stands for a list of one.
    const clauses = list.every(Array.isArray) ? list : [list];
    return mapClauses(clauses, ([head, op, ...value]) => [
      tokenPath(String(head)),
      op,
      ...value.map((v) => JSON.stringify(v)),
    ]);
  } catch {
    return null;
  }
}

/** A rule as the dialog edits it, core's attribute and afreact's together, as both must hold. */
export function readRule(node: ShallowElement, rule: Rule): unknown[] | null {
  const core = parseRule(textAttribute(node, rule));
  const own = fromRowSyntax(textAttribute(node, ROW_CONDITIONS[rule]));
  if (!core || !own) return null;
  // At runtime a required or disabled rule decides alone; both af-if rules must hold.
  if (rule === "af-if" || !core.length || !own.length) return [...core, ...own];
  const all = (clauses: unknown[]) => (clauses.length === 1 ? clauses[0] : ["AND", clauses]);
  return [["OR", [all(core), all(own)]]];
}

/**
 * The element with its rules set: an empty rule goes, a set one replaces its static counterpart.
 * A rule that refers to the element's own row or compares two fields goes into afreact's attribute.
 */
export function withRules(
  node: ShallowElement,
  rules: Partial<Record<Rule, unknown[] | null>>,
): ShallowElement {
  let next = node;
  for (const rule of RULES) {
    const conditions = rules[rule];
    if (conditions === undefined || conditions === null) continue;
    const own = ROW_CONDITIONS[rule];
    if (!conditions.length) {
      next = withoutAttributes(next, [rule, own]);
      continue;
    }
    // Not both `required` and `af-required`.
    if (rule !== "af-if") next = withoutDefnKey(next, rule.replace("af-", ""));
    // deviation:row-conditions
    if (usesRowSyntax(conditions)) {
      const tokens = mapClauses(conditions, ([head, op, ...value]) => [
        pathToken(String(head)),
        op,
        ...value.map((v) => parseValue(v).value),
      ]);
      next = {
        ...withoutAttributes(next, [rule]),
        [own]: JSON.stringify(tokens),
      };
    } else {
      next = {
        ...withoutAttributes(next, [own]),
        [rule]: `(${JSON.stringify(conditions)})`,
      };
    }
  }
  return next;
}

export interface RowScope {
  entity: string;
  /** The af-fieldset repeats, so `@` stands for its row. */
  entityRepeated: boolean;
  /** The repeated af-join the element sits in. */
  join?: string;
}

/** The repeats around the element at `path`, whose rows `@` can name; null outside any. */
export function rowScope(layout: ShallowNode[], path: NodePath): RowScope | null {
  let scope = null as RowScope | null;
  for (let depth = 1; depth < path.length; depth++) {
    const node = nodeAt(layout, path.slice(0, depth));
    if (!isElement(node)) continue;
    const fieldset = textAttribute(node, "af-fieldset");
    const join = textAttribute(node, "af-join");
    if (fieldset)
      scope = {
        entity: fieldset,
        entityRepeated: node["af-repeat"] !== undefined,
      };
    else if (join && scope && node["af-repeat"] !== undefined) scope = { ...scope, join };
  }
  return scope && (scope.entityRepeated || scope.join) ? scope : null;
}

interface FieldChoices {
  options: PickerOption[];
  defns: Record<string, GuiField>;
}

const fieldLabel = (field: GuiField) => {
  const attrs = field.input_attrs;
  const fallback =
    typeof attrs === "object" && attrs !== null && "label" in attrs ? attrs.label : undefined;
  if (field.label) return field.label;
  return typeof fallback === "string" ? fallback : field.name;
};

/** loadAllFields(): the fields on the form, by entity and join, keyed by their path in the data. */
// deviation:condition-fields-once
export function fieldChoices(
  editor: Pick<EditorApi, "afform" | "meta" | "entities">,
  row: RowScope | null = null,
): FieldChoices {
  const result: FieldChoices = { options: [], defns: {} };
  for (const entity of editor.entities) {
    const fields = entityFields(editor, entity);
    if (row?.entity === entity.name) addRowChoices(result, editor, row, fields);
    for (const field of fields.fields) {
      const key = `${entity.name}[0][fields][${field.name}]`;
      result.defns[key] = field;
      result.options.push({ id: key, label: fieldLabel(field), group: entity.label });
    }
    // deviation:condition-join-block-index
    for (const join of fields.joins) {
      const joinLabel = editor.meta.gui.entities[join.entity]?.label ?? join.entity;
      const group = `${entity.label}: ${joinLabel} ${join.joinIndex + 1}`;
      for (const field of join.fields) {
        const key = `${entity.name}[0][joins][${join.entity}][${join.joinIndex}][${field.name}]`;
        result.defns[key] = field;
        result.options.push({ id: key, label: fieldLabel(field), group });
      }
    }
  }
  return result;
}

/** The fields of the rows the element sits in, as tokens with `@`. */
function addRowChoices(
  result: FieldChoices,
  editor: Pick<EditorApi, "meta" | "entities">,
  row: RowScope,
  fields: ReturnType<typeof entityFields>,
) {
  const entity = editor.entities.find((e) => e.name === row.entity);
  const label = entity?.label ?? row.entity;
  const index = row.entityRepeated ? "@" : "0";
  const add = (key: string, field: GuiField, group: string) => {
    if (key in result.defns) return;
    result.defns[key] = field;
    result.options.push({ id: key, label: fieldLabel(field), group });
  };
  if (row.join) {
    const joinLabel = editor.meta.gui.entities[row.join]?.label ?? row.join;
    const group = ts("%1: %2, this row", { 1: label, 2: joinLabel });
    for (const join of fields.joins.filter((j) => j.entity === row.join))
      for (const field of join.fields)
        add(`[${row.entity}.${index}.${row.join}.@.${field.name}]`, field, group);
  }
  // Inside a repeated join too, the entity's fields read the row the join sits in.
  if (row.entityRepeated) {
    const group = ts("%1, this row", { 1: label });
    for (const field of fields.fields) add(`[${row.entity}.@.${field.name}]`, field, group);
  }
}

const conditionField = (field: GuiField | undefined): ConditionField | undefined =>
  field && {
    name: field.name,
    data_type: field.data_type ?? "String",
    operators: Array.isArray(field.operators)
      ? field.operators.filter((op): op is string => typeof op === "string")
      : null,
    serialize:
      typeof field.serialize === "number" || typeof field.serialize === "boolean"
        ? field.serialize
        : null,
  };

const parseValue = (value: unknown): { value: unknown; readable: boolean } => {
  if (typeof value !== "string") return { value, readable: true };
  try {
    const parsed: unknown = JSON.parse(value);
    return { value: parsed, readable: true };
  } catch {
    return { value, readable: false };
  }
};

/** changeClauseOperator() on a clause whose value is JSON text. */
function withAfOperator(clause: unknown[], op: string): unknown[] {
  const parsed = clause.length > 2 ? [...clause.slice(0, 2), parseValue(clause[2]).value] : clause;
  const next = withOperator(parsed, 1, op);
  return next.length > 2 ? [...next.slice(0, 2), JSON.stringify(next[2])] : next;
}

/** updateOperators(): an operator the field does not allow, or core's legacy `==`, is replaced. */
function fitClause(clause: unknown[], defns: Record<string, GuiField>): unknown[] {
  if (isClauseGroup(clause))
    return [clause[0], clause[1].map((c) => (Array.isArray(c) ? fitClause(c, defns) : c))];
  const field = typeof clause[0] === "string" ? defns[clause[0]] : undefined;
  const allowed = allowedOperators(conditionField(field), operators());
  const op = clause[1] === "==" ? "=" : clause[1];
  if (typeof op === "string" && allowed.some((o) => o.key === op))
    return op === clause[1] ? clause : [clause[0], op, ...clause.slice(2)];
  const first = allowed[0];
  return first ? withAfOperator(clause, first.key) : clause;
}

function ConditionalDialog({
  ops,
  readOnlyField,
  rule: initial,
  close,
}: {
  ops: NodeOps;
  readOnlyField: boolean;
  rule: Rule | undefined;
  close: () => void;
}) {
  const editor = useEditor();
  const base = useId();
  const applicable = ops.node["#tag"] !== "af-field" || readOnlyField ? RULES.slice(0, 1) : RULES;
  const [choices] = useState(() => fieldChoices(editor, rowScope(editor.afform.layout, ops.path)));
  const [conditions, setConditions] = useState(() =>
    Object.fromEntries(
      applicable.map((rule) => {
        const parsed = readRule(ops.node, rule);
        return [
          rule,
          parsed?.map((c) => (Array.isArray(c) ? fitClause(c, choices.defns) : c)) ?? null,
        ];
      }),
    ),
  );
  const [active, setActive] = useState<string>(
    initial && applicable.includes(initial) ? initial : (applicable[0] ?? "af-if"),
  );
  const apply = () => {
    ops.edit((node) => withRules(node, conditions));
    close();
  };
  return (
    <Dialog
      title={ts("Conditional Rules")}
      wide
      className="af-gui-conditional-dialog"
      onClose={close}
      buttons={
        <button type="button" className="btn btn-primary" onClick={apply}>
          <i className="crm-i fa-check" role="img" aria-hidden="true" /> {ts("Apply Changes")}
        </button>
      }
    >
      {applicable.length > 1 && (
        <TabList
          base={base}
          active={active}
          onSelect={setActive}
          items={applicable.map((rule) => ({
            key: rule,
            label: (
              <>
                <i
                  className={`crm-i ${conditions[rule]?.length ? "fa-code-fork" : "fa-circle"}`}
                  role="img"
                  aria-hidden="true"
                />{" "}
                {ruleText(rule).title}
              </>
            ),
          }))}
        />
      )}
      {applicable.map((rule) => {
        const list = conditions[rule] ?? null;
        const panel = (
          <>
            <div className="help">{ruleText(rule).description}</div>
            {list === null ? (
              <p className="alert alert-warning" role="alert">
                {ts("This rule is not in a form the builder can edit; it stays as it is.")}
              </p>
            ) : (
              choices.options.length > 0 && (
                <div className="api4-clause-fieldset">
                  <ClauseGroup
                    root={list}
                    list={list}
                    path={[]}
                    op="AND"
                    label={ts("If")}
                    choices={choices}
                    onChange={(update) => {
                      setConditions((current) => ({
                        ...current,
                        [rule]: update(current[rule] ?? list),
                      }));
                    }}
                  />
                </div>
              )
            )}
          </>
        );
        return applicable.length > 1 ? (
          <TabPanel key={rule} base={base} tab={rule} active={active}>
            {panel}
          </TabPanel>
        ) : (
          <div key={rule}>{panel}</div>
        );
      })}
    </Dialog>
  );
}

interface GroupProps {
  /** The whole rule as drawn, which moves read. */
  root: unknown[];
  list: unknown[];
  path: ClausePath;
  op: string;
  label?: string;
  choices: FieldChoices;
  /** Applied to the latest rule, so a change reported a render late keeps earlier ones. */
  onChange: (update: (root: unknown[]) => unknown[]) => void;
  onDeleteGroup?: () => void;
}

function updateAt(
  root: unknown[],
  path: ClausePath,
  update: (list: unknown[]) => unknown[],
): unknown[] {
  const [head, ...rest] = path;
  if (head === undefined) return update(root);
  return root.map((clause, index) =>
    index === head && isClauseGroup(clause)
      ? [clause[0], updateAt(clause[1], rest, update)]
      : clause,
  );
}

/** The tree with `clause` edited where the tree now holds it, after moves reported earlier. */
function editClause(
  root: unknown[],
  clause: unknown[],
  update: (clause: unknown[]) => unknown[],
): unknown[] {
  const path = clausePath(root, clause);
  const index = path?.at(-1);
  if (!path || index === undefined) return root;
  return updateAt(root, path.slice(0, -1), (list) =>
    list.map((c, i) => (i === index && Array.isArray(c) ? update(c) : c)),
  );
}

/** afGuiClause: a group of conditions joined by one conjunction, with nested groups. */
function ClauseGroup({
  root,
  list,
  path,
  op,
  label,
  choices,
  onChange,
  onDeleteGroup,
}: GroupProps) {
  const id = useId();
  const names = conjunctions();
  const groupLabel = label ?? ts("%1 group", { 1: names[op] ?? op });
  const setList = (update: (current: unknown[]) => unknown[]) => {
    onChange((latest) => updateAt(latest, path, update));
  };
  const remove = (index: number) => {
    setList((current) => current.filter((_, i) => i !== index));
  };
  return (
    <fieldset className="afreact-clause-group">
      <legend className={onDeleteGroup ? "" : "sr-only"}>{groupLabel}</legend>
      <NgElement tag="af-gui-clause">
        {onDeleteGroup && (
          <div className="btn-group btn-group-xs">
            <button
              type="button"
              className="btn btn-danger-outline"
              title={ts("Remove group")}
              aria-label={ts("Remove %1", { 1: groupLabel })}
              onClick={onDeleteGroup}
            >
              <i className="crm-i fa-trash" role="img" aria-hidden="true" />
            </button>
          </div>
        )}
        {list.map((clause, index) => {
          if (!Array.isArray(clause)) return null;
          const childPath = [...path, index];
          const badge = index === 0 && !onDeleteGroup ? label : names[op];
          const head: unknown = clause[0];
          const name = isClauseGroup(clause)
            ? ts("%1 group", { 1: names[clause[0]] ?? clause[0] })
            : (choices.options.find((o) => o.id === head)?.label ?? String(head));
          return (
            <div className="api4-input form-inline clearfix" key={index}>
              <span className="api4-clause-badge">
                <span className="badge badge-info">{badge}</span>
              </span>
              {/* deviation:condition-clause-move-buttons */}
              <ClauseMoveButtons
                tree={{ root, path, skip: 0, onChange }}
                index={index}
                name={name}
              />
              {isClauseGroup(clause) ? (
                <ClauseGroup
                  root={root}
                  list={clause[1]}
                  path={childPath}
                  op={clause[0]}
                  choices={choices}
                  onChange={onChange}
                  onDeleteGroup={() => {
                    remove(index);
                  }}
                />
              ) : (
                <ClauseRow
                  clause={clause}
                  name={name}
                  choices={choices}
                  onChange={(update) => {
                    onChange((latest) => editClause(latest, clause, update));
                  }}
                  onRemove={() => {
                    remove(index);
                  }}
                />
              )}
            </div>
          );
        })}
        <div className="api4-input form-inline">
          <select
            className="form-control crm-auto-width btn-info"
            aria-label={
              onDeleteGroup ? ts("Add a subgroup of clauses") : ts("Add a group of clauses")
            }
            value=""
            onChange={(event) => {
              const conjunction = event.target.value;
              if (conjunction) setList((current) => [...current, [conjunction, []]]);
            }}
          >
            <option value="">{names[op]}</option>
            {Object.entries(names)
              .filter(([key]) => key !== op)
              .map(([key, name]) => (
                <option key={key} value={key}>
                  {ts("%1 group", { 1: name })}
                </option>
              ))}
          </select>
          <Picker
            id={`${id}-add`}
            label={ts("Select field")}
            hiddenLabel
            placeholder={ts("Select field")}
            className="crm-auto-width"
            single
            options={choices.options}
            value={[]}
            onChange={(picked) => {
              const field = picked[0];
              if (field === undefined) return;
              setList((current) => [
                ...current,
                fitClause([String(field), "=", '""'], choices.defns),
              ]);
            }}
          />
        </div>
      </NgElement>
    </fieldset>
  );
}

function ClauseRow({
  clause,
  name,
  choices,
  onChange,
  onRemove,
}: {
  clause: unknown[];
  name: string;
  choices: FieldChoices;
  onChange: (update: (clause: unknown[]) => unknown[]) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const key = typeof clause[0] === "string" ? clause[0] : "";
  const field = choices.defns[key];
  return (
    <div className="api4-input-group">
      <Picker
        id={`${id}-field`}
        label={ts("Field")}
        hiddenLabel
        placeholder={ts("Field")}
        className="collapsible-optgroups"
        single
        options={choices.options}
        value={key ? [key] : []}
        onChange={(picked) => {
          const next = picked[0];
          // Clearing the field removes the clause.
          if (next === undefined) onRemove();
          else onChange((c) => fitClause([String(next), ...c.slice(1)], choices.defns));
        }}
      />{" "}
      <Condition
        id={id}
        clause={clause}
        field={field}
        name={name}
        choices={choices}
        onChange={onChange}
      />{" "}
      <button
        type="button"
        className="btn btn-xs btn-danger-outline"
        aria-label={ts("Remove condition on %1", { 1: name })}
        title={ts("Remove")}
        onClick={onRemove}
      >
        <i className="crm-i fa-times" role="img" aria-hidden="true" />
      </button>
    </div>
  );
}

/** afGuiCondition: the operator and the value, held as JSON text. */
function Condition({
  id,
  clause,
  field,
  name,
  choices,
  onChange,
}: {
  id: string;
  clause: unknown[];
  field: GuiField | undefined;
  name: string;
  choices: FieldChoices;
  onChange: (update: (clause: unknown[]) => unknown[]) => void;
}) {
  const allowed = allowedOperators(conditionField(field), operators());
  const op = typeof clause[1] === "string" ? clause[1] : "";
  const { value, readable } = parseValue(clause[2]);
  const compared = typeof value === "string" && parseToken(value) !== null ? value : null;
  const setValue = (next: unknown) => {
    onChange((c) => [c[0], c[1], JSON.stringify(next)]);
  };
  const between = op === "BETWEEN" || op === "NOT BETWEEN";
  // A field no longer on the form is compared as text, as core's input does without a field.
  const input = field ?? { name: typeof clause[0] === "string" ? clause[0] : "" };
  const pair = Array.isArray(value) ? value : ["", ""];
  return (
    <span className="form-group">
      <select
        className="form-control api4-operator"
        aria-label={ts("Operator for %1", { 1: name })}
        value={op}
        onChange={(event) => {
          const picked = event.target.value;
          onChange((c) => withAfOperator(c, picked));
        }}
      >
        {allowed.map((operator) => (
          <option key={operator.key} value={operator.key}>
            {operator.value}
          </option>
        ))}
      </select>{" "}
      {!op.startsWith("IS ") && !between && (
        <label className="afreact-compare-field">
          <input
            type="checkbox"
            checked={compared !== null}
            onChange={(event) => {
              const first = choices.options.find((o) => o.id !== clause[0]);
              setValue(event.target.checked && first ? pathToken(String(first.id)) : "");
            }}
          />{" "}
          {ts("Compare with a field")}
        </label>
      )}{" "}
      {compared !== null &&
        !op.startsWith("IS ") &&
        !between && (
          // deviation:row-conditions
          <Picker
            id={`${id}-compared`}
            label={ts("Field compared with %1", { 1: name })}
            hiddenLabel
            placeholder={ts("Field")}
            className="collapsible-optgroups"
            single
            options={choices.options}
            value={[
              choices.options.find((o) => pathToken(String(o.id)) === compared)?.id ?? compared,
            ]}
            onChange={(picked) => {
              const next = picked[0];
              setValue(next === undefined ? "" : pathToken(String(next)));
            }}
          />
        )}
      {compared === null && !op.startsWith("IS ") && (
        <span className="form-group">
          <label htmlFor={`${id}-value`} className="sr-only">
            {between ? ts("From value for %1", { 1: name }) : ts("Value for %1", { 1: name })}
          </label>
          <FieldValue
            id={`${id}-value`}
            field={input}
            op={between ? ">" : op}
            value={between ? pair[0] : value}
            onChange={(next) => {
              setValue(between ? [next, pair[1]] : next);
            }}
          />
          {between && (
            <>
              {" - "}
              <label htmlFor={`${id}-to`} className="sr-only">
                {ts("To value for %1", { 1: name })}
              </label>
              <FieldValue
                id={`${id}-to`}
                field={input}
                op="<"
                value={pair[1]}
                onChange={(next) => {
                  setValue([pair[0], next]);
                }}
              />
            </>
          )}
        </span>
      )}
      {!readable && (
        <span className="text-warning" role="alert">
          {ts("The value %1 is not valid JSON; it is shown as text.", { 1: String(clause[2]) })}
        </span>
      )}
    </span>
  );
}
