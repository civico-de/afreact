import { useQuery } from "@tanstack/react-query";
import { useContext } from "react";
import { errorMessage } from "../../api/civi";
import { Markup, plainUrl } from "../Markup";
import type { FieldDefn, FieldOption } from "../types";
import { resolveIds, searchedEntity, valueIds } from "./autocomplete";
import { FieldEnvContext, type FieldEnv } from "./env";
import { isFileInfo } from "./upload";

interface ShownProps {
  id: string;
  defn: FieldDefn;
  value: unknown;
}

interface DisplayOnlyProps extends ShownProps {
  /** afField's fieldOptions: the field's options, or Yes/No for a Boolean; null without. */
  options: FieldOption[] | null;
}

function isEmpty(value: unknown): boolean {
  if (Array.isArray(value)) return !value.length;
  return value === undefined || value === null || value === "";
}

/** Labels of the chosen options in option order; a value without option shows as stored. */
function optionText(options: FieldOption[], value: unknown): string {
  const keys: unknown[] = Array.isArray(value) ? value : [value];
  const matches = (key: unknown, option: FieldOption) => String(key) === String(option.id);
  return [
    ...options.filter((option) => keys.some((key) => matches(key, option))).map((o) => o.label),
    ...keys.filter((key) => !options.some((option) => matches(key, option))).map(String),
  ].join(", ");
}

/** CRM.utils.formatDate in the site's format; a value it cannot read shows as stored. */
function dateText(defn: FieldDefn, value: unknown): string {
  try {
    return window.CRM.utils.formatDate(value, null, defn.data_type === "Timestamp");
  } catch {
    return String(value);
  }
}

/** fields/DisplayOnly.html with afField's getDisplayValue(). */
export function DisplayOnly({ id, defn, value, options }: DisplayOnlyProps) {
  const env = useContext(FieldEnvContext);
  const props = { id, defn, value };
  if (isEmpty(value)) return <Shown {...props} text="" />;
  if (options) return <Shown {...props} text={optionText(options, value)} />;
  if (defn.data_type === "Date" || defn.data_type === "Timestamp") {
    return <Shown {...props} text={dateText(defn, value)} />;
  }
  const target = env ? searchedEntity(defn, env) : { entity: defn.fk_entity ?? null };
  if ("error" in target) return <Shown {...props} text="" error={target.error} />;
  if (target.entity === null) {
    return <Shown {...props} text={Array.isArray(value) ? value.join(",") : String(value)} />;
  }
  if (!env) throw new Error(`${defn.name} shows a reference outside a FieldEnvContext`);
  return <References {...props} env={env} entity={target.entity} />;
}

/** A reference: the records' autocomplete labels, from the query EntityRef loads them with. */
function References(props: ShownProps & { env: FieldEnv; entity: string }) {
  const { env, entity } = props;
  const ids = valueIds(props.value);
  const resolved = useQuery({
    queryKey: [
      entity,
      "autocomplete",
      env.formName,
      env.modelName,
      env.joinEntity,
      env.fieldName,
      ids,
    ],
    queryFn: () => resolveIds(entity, env, ids),
  });
  if (resolved.isError) return <Shown {...props} text="" error={errorMessage(resolved.error)} />;
  if (!resolved.data) return <Shown {...props} text={ts("Loading...")} />;
  const labels = new Map(resolved.data.map((item) => [String(item.id), item.label]));
  const text = ids.map((item) => labels.get(String(item)) ?? String(item)).join(", ");
  return <Shown {...props} text={text} />;
}

/** DisplayOnly.html's display_format branches. */
function Shown({ id, defn, value, text, error }: ShownProps & { text: string; error?: string }) {
  const shown = (() => {
    switch (defn.display_format) {
      case "file": {
        if (!isFileInfo(value) || !value.file_name) return null;
        const icon = (
          <i className={`crm-i ${value.icon ?? ""}`.trim()} role="img" aria-hidden="true" />
        );
        return value.url ? (
          <a href={value.url}>
            {icon} {value.file_name}
          </a>
        ) : (
          <span>
            {icon} {value.file_name}
          </span>
        );
      }
      case "html":
        return <Markup html={text} tokens={false} record />;
      case "url":
        // ng-href leaves a link of another scheme dead; here it stays text.
        if (isEmpty(value) || !plainUrl(String(value))) return text;
        return <a href={String(value)}>{text}</a>;
      default:
        return text;
    }
  })();
  return (
    <>
      <output id={id}>{shown}</output>
      {error && (
        <span className="crm-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
