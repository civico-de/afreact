import type { EditorApi } from "./context";
import { entityFields } from "./fields";
import { isLiteralObject } from "./literal";
import { filled, jsAttribute } from "./model";

export interface Token {
  id: string;
  text: string;
  description?: string;
}

export interface TokenGroup {
  text: string;
  children: Token[];
}

/** The core whose submission fills tokens of joined records (core f10a0a6933). */
export const JOIN_TOKENS = { "6.21": "6.21.alpha1" };

/**
 * editor.getTokens(): per entity its submission tokens, or its id, data values and placed fields,
 * then with `joins` each join block's; with the submission tokens, the form's JWT last.
 */
export function formTokens(
  editor: Pick<EditorApi, "entities" | "meta" | "afform">,
  includeSubmission: boolean,
  joins: boolean,
): TokenGroup[] {
  const groups: TokenGroup[] = [];
  for (const entity of editor.entities) {
    const meta = editor.meta.gui.entities[entity.type];
    if (!meta) throw new Error(`No metadata for entity type ${entity.type}.`);
    // deviation:token-groups-by-entity-name
    const group = filled(entity.label) ?? meta.label;
    const tokens: Token[] = [];
    const joinGroups: TokenGroup[] = [];
    if (meta.submissionTokens && includeSubmission) {
      for (const token of meta.submissionTokens)
        tokens.push({
          id: `${entity.name}.0.${token.token}`,
          text: token.label,
          description: token.description ?? "",
        });
    } else if (!meta.submissionTokens) {
      if (includeSubmission)
        tokens.push({ id: `${entity.name}.0.id`, text: ts("%1 ID", { 1: meta.label }) });
      const data = jsAttribute(entity.node, "data");
      if (isLiteralObject(data))
        for (const key of Object.keys(data)) {
          const field = meta.fields?.[key];
          if (field) tokens.push({ id: `${entity.name}.0.${key}`, text: field.label ?? key });
        }
      const placed = entityFields(editor, entity);
      for (const field of placed.fields)
        tokens.push({ id: `${entity.name}.0.${field.name}`, text: field.label ?? field.name });
      for (const join of joins ? placed.joins : []) {
        const label = editor.meta.gui.entities[join.entity]?.label ?? join.entity;
        const prefix = `${entity.name}.0.${join.entity}.${join.joinIndex}`;
        const children = join.fields.map((field) => ({
          id: `${prefix}.${field.name}`,
          text: field.label ?? field.name,
        }));
        if (includeSubmission) children.unshift({ id: `${prefix}.id`, text: `${label} ID` });
        const text = `${group}: ${label} ${join.joinIndex + 1}`;
        if (children.length) joinGroups.push({ text, children });
      }
    }
    if (tokens.length) groups.push({ text: group, children: tokens });
    groups.push(...joinGroups);
  }
  if (includeSubmission)
    groups.push({ text: ts("Form"), children: [{ id: "token", text: ts("Submission JWT") }] });
  return groups;
}
