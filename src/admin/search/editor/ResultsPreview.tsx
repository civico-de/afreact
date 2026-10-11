import { useId } from "react";
import { AfreactSearch } from "../../../search/AfreactSearch";
import { isDisplaySettings, type RunDebug } from "../../../search/types";
import { Picker } from "../../widgets/Picker";
import { fieldToColumn, getDefaultLabel, type ApiParams, type SearchInfo } from "../expr";
import type { SearchAdminMetadata } from "../meta";
import { addColumn, selectableFields } from "./FieldsTab";

interface ResultsPreviewProps {
  meta: SearchAdminMetadata;
  search: SearchInfo & { name?: string };
  /** A smart group reserves the first column for its contact ID. */
  firstLocked: boolean;
  onChange: (params: ApiParams) => void;
  onDebug: (debug: RunDebug) => void;
}

/** The default display's settings for the columns being edited plus the links menu column; null when invalid. */
export function previewSettings(meta: SearchAdminMetadata, search: SearchInfo) {
  const defaults = meta.defaultDisplay.settings;
  const settings = {
    ...(typeof defaults === "object" && defaults !== null ? structuredClone(defaults) : {}),
    button: ts("Search"),
    columns: [
      ...search.api_params.select.map((expr) =>
        fieldToColumn(meta, expr, { label: true, sortable: true }, search),
      ),
      {
        type: "menu",
        icon: "fa-bars",
        size: "btn-xs",
        style: "secondary-outline",
        alignment: "text-right",
        links: [],
      },
    ],
  };
  return isDisplaySettings(settings) ? settings : null;
}

/** crmSearchAdminResultsTable: runs the unsaved search on click, with column controls in the header. */
export function ResultsPreview({
  meta,
  search,
  firstLocked,
  onChange,
  onDebug,
}: ResultsPreviewProps) {
  const id = useId();
  const select = search.api_params.select;
  const settings = previewSettings(meta, search);
  if (!settings)
    return (
      <p className="crm-error" role="alert">
        {ts("The default display has no valid settings, so the results cannot be previewed.")}
      </p>
    );
  const move = (from: number, to: number) => {
    const next = [...select];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    onChange({ ...search.api_params, select: next });
  };
  const inline = {
    search: { name: search.name, api_entity: search.api_entity, api_params: search.api_params },
  };
  return (
    <AfreactSearch
      search={search.name ?? ""}
      display={null}
      type="table"
      settings={settings}
      inline={inline}
      onDebug={onDebug}
      headerTools={{
        column: (index) => {
          if (index >= select.length) return null;
          const label = getDefaultLabel(meta, select[index] ?? "", search);
          if (firstLocked && index === 0)
            return (
              <span title={ts("Column reserved for smart group.")}>
                {" "}
                <i className="crm-i fa-lock" role="img" aria-hidden="true" />
                <span className="sr-only">{ts("Column reserved for smart group.")}</span>
              </span>
            );
          // Clicks here must not sort the column.
          return (
            <span
              className="afreact-preview-column-tools"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              {index > (firstLocked ? 1 : 0) && (
                <button
                  type="button"
                  className="crm-hover-button"
                  aria-label={ts("Move %1 left", { 1: label })}
                  onClick={() => {
                    move(index, index - 1);
                  }}
                >
                  <i className="crm-i fa-arrow-left" role="img" aria-hidden="true" />
                </button>
              )}
              {index < select.length - 1 && (
                <button
                  type="button"
                  className="crm-hover-button"
                  aria-label={ts("Move %1 right", { 1: label })}
                  onClick={() => {
                    move(index, index + 1);
                  }}
                >
                  <i className="crm-i fa-arrow-right" role="img" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                className="crm-hover-button"
                aria-label={ts("Remove %1", { 1: label })}
                onClick={() => {
                  onChange({ ...search.api_params, select: select.filter((_, i) => i !== index) });
                }}
              >
                <i className="crm-i fa-times" role="img" aria-hidden="true" />
              </button>
            </span>
          );
        },
        endLabel: ts("Add column"),
        end: (
          <Picker
            id={`${id}-add`}
            label={ts("Add field to results")}
            hiddenLabel
            placeholder=" "
            className="crm-auto-width"
            single
            options={selectableFields(meta, search)}
            value={[]}
            onChange={(picked) => {
              const next = picked[0];
              if (next !== undefined) onChange(addColumn(meta, search, String(next)));
            }}
          />
        ),
      }}
    />
  );
}
