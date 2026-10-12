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

/**
 * editor.getTokens(): per entity its submission tokens, or its id, data values and placed fields;
 * with the submission tokens, the form's JWT last.
 */
export function formTokens(
  editor: Pick<EditorApi, "entities" | "meta" | "afform">,
  includeSubmission: boolean,
): TokenGroup[] {
  const groups: TokenGroup[] = [];
  for (const entity of editor.entities) {
    const meta = editor.meta.gui.entities[entity.type];
    if (!meta) throw new Error(`No metadata for entity type ${entity.type}.`);
    const tokens: Token[] = [];
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
      for (const field of entityFields(editor, entity).fields)
        tokens.push({ id: `${entity.name}.0.${field.name}`, text: field.label ?? field.name });
    }
    // deviation:token-groups-by-entity-name
    if (tokens.length) groups.push({ text: filled(entity.label) ?? meta.label, children: tokens });
  }
  if (includeSubmission)
    groups.push({ text: ts("Form"), children: [{ id: "token", text: ts("Submission JWT") }] });
  return groups;
}
