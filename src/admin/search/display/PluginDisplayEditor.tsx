import { useEffect, useEffectEvent, useId, useRef } from "react";
import { useDebugFacts } from "../../../debug/debug";
import { getDefaultLabel, getField, parseExpr, type SearchInfo } from "../expr";
import type { SearchAdminMetadata } from "../meta";
import type { EditorDisplay } from "../editor";
import { ModelText } from "../../widgets/ModelText";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// deviation:search-display-plugin-editors
export const pluginEditorTag = (type: string) => `afreact-search-admin-display-${type}`;

/** Whether another extension registered an editor element for the display type. */
export const hasPluginEditor = (type: string) =>
  customElements.get(pluginEditorTag(type)) !== undefined;

/** The search's columns as the contract hands them: key, label and data type. */
export function pluginColumns(meta: SearchAdminMetadata, search: SearchInfo) {
  return search.api_params.select.map((expr) => {
    const info = parseExpr(meta, expr, search);
    return {
      key: info.alias,
      label: getDefaultLabel(meta, expr, search),
      data_type: info.data_type ?? info.args[0]?.field?.data_type ?? null,
    };
  });
}

/** core's getSearchInfo: a record, an entity name, or nothing, which has no fields. */
function searchInfo(savedSearch: unknown): SearchInfo {
  if (typeof savedSearch === "string")
    return { api_entity: savedSearch, api_params: { select: [] } };
  if (isRecord(savedSearch) && typeof savedSearch.api_entity === "string")
    return {
      api_entity: savedSearch.api_entity,
      api_params: isRecord(savedSearch.api_params)
        ? { select: [], ...savedSearch.api_params }
        : { select: [] },
      form_values: isRecord(savedSearch.form_values) ? savedSearch.form_values : undefined,
    };
  return { api_entity: "", api_params: { select: [] } };
}

/** The part of core's searchMeta service plugins call, on React's metadata. */
export function pluginSearchMeta(meta: SearchAdminMetadata) {
  return {
    parseExpr: (expr: string, savedSearch?: unknown) =>
      expr ? parseExpr(meta, expr, searchInfo(savedSearch)) : undefined,
    getDefaultLabel: (expr: string, savedSearch?: unknown) =>
      getDefaultLabel(meta, expr, searchInfo(savedSearch)),
    getField: (fieldName: string, savedSearch?: unknown) =>
      getField(meta, fieldName, searchInfo(savedSearch)),
  };
}

/** A display type editor from another extension, as a custom element in light DOM. */
export function PluginDisplayEditor({
  meta,
  search,
  display,
  onLabel,
  onSettings,
}: {
  meta: SearchAdminMetadata;
  search: SearchInfo & { name?: string };
  display: EditorDisplay;
  onLabel: (label: string) => void;
  onSettings: (settings: Record<string, unknown>) => void;
}) {
  const id = useId();
  const host = useRef<HTMLDivElement>(null);
  const element = useRef<HTMLElement | null>(null);
  const sendSettings = useEffectEvent((settings: Record<string, unknown>) => {
    onSettings(settings);
  });
  const tag = pluginEditorTag(display.type);
  useDebugFacts({ [ts("Other extensions' elements")]: [tag] });

  useEffect(() => {
    const created = document.createElement(tag);
    created.setAttribute("data-afreact-plugin", "");
    const listener = (event: Event) => {
      if (event instanceof CustomEvent && event.target === created) {
        const detail: unknown = event.detail;
        const settings = isRecord(detail) ? detail.settings : undefined;
        if (!isRecord(settings))
          throw new TypeError(`${tag} sent a change without a settings object.`);
        sendSettings(settings);
      }
    };
    created.addEventListener("change", listener);
    host.current?.append(created);
    element.current = created;
    return () => {
      created.removeEventListener("change", listener);
      created.remove();
      element.current = null;
    };
  }, [tag]);

  useEffect(() => {
    const current = element.current;
    if (!current) return;
    Reflect.set(current, "savedSearch", {
      name: search.name,
      api_entity: search.api_entity,
      api_params: search.api_params,
    });
    Reflect.set(current, "columns", pluginColumns(meta, search));
    Reflect.set(current, "searchMeta", pluginSearchMeta(meta));
    Reflect.set(current, "display", structuredClone(display));
  });

  return (
    <>
      <div className="form-group">
        <label htmlFor={`${id}-label`}>{ts("Display Label")}</label>
        <ModelText
          id={`${id}-label`}
          className="form-control"
          live
          required
          value={display.label}
          onChange={onLabel}
        />
      </div>
      <div ref={host} />
    </>
  );
}
