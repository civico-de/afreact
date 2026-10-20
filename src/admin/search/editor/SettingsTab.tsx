import { useId } from "react";
import { EntityTags } from "../../widgets/EntityTags";
import { ModelText } from "../../widgets/ModelText";
import { useCoreHas } from "../../version";
import { fromLocalDateTime, toLocalDateTime } from "../../../afform/fields/dateTime";
import { SAVED_SEARCH_FIELDS, validTimeout, type EditorSearch } from "../editor";

interface SettingsTabProps {
  search: EditorSearch;
  canBeEntitySet: boolean;
  onChange: (change: Partial<EditorSearch>) => void;
  onToggleEntitySet: () => void;
}

/** crmSearch-settings: description, timeout, expiry, tags and combining searches. */
export function SettingsTab({
  search,
  canBeEntitySet,
  onChange,
  onToggleEntitySet,
}: SettingsTabProps) {
  // An older core drops a field it lacks on save, so it is not offered there.
  const hasTimeout = useCoreHas(SAVED_SEARCH_FIELDS.timeout ?? {});
  const id = useId();
  return (
    <>
      <div className="form-group">
        <label htmlFor={`${id}-description`}>{ts("Description")}</label>
        <ModelText
          id={`${id}-description`}
          className="form-control"
          multiline
          rows={3}
          live
          placeholder={ts("None")}
          value={search.description ?? ""}
          onChange={(description) => {
            onChange({ description });
          }}
        />
      </div>
      {hasTimeout && (
        <div className={`form-group${validTimeout(search.timeout) ? "" : " has-error"}`}>
          <label htmlFor={`${id}-timeout`}>{ts("Query Timeout (seconds)")}</label>
          <input
            id={`${id}-timeout`}
            type="number"
            min={0}
            className="form-control six"
            placeholder={ts("Site default")}
            value={search.timeout ?? ""}
            aria-invalid={!validTimeout(search.timeout) || undefined}
            onChange={(event) => {
              onChange({ timeout: event.target.value === "" ? null : Number(event.target.value) });
            }}
          />
        </div>
      )}
      <div className="form-group">
        <label htmlFor={`${id}-expires`}>{ts("Search Expiry Date")}</label>
        <div className="input-group">
          <div className="input-group-addon">
            <i className="crm-i fa-calendar-times-o" role="img" aria-hidden="true" />
          </div>
          <input
            id={`${id}-expires`}
            type="datetime-local"
            className="form-control"
            value={toLocalDateTime(search.expires_date)}
            onChange={(event) => {
              onChange({ expires_date: fromLocalDateTime(event.target.value) });
            }}
          />
        </div>
      </div>
      <div className="form-group">
        <EntityTags
          size="sm"
          entityTable="civicrm_saved_search"
          tagIds={search.tag_id}
          onChange={(tag_id) => {
            onChange({ tag_id });
          }}
        />
      </div>
      {canBeEntitySet && (
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={search.api_entity === "EntitySet"}
              onChange={onToggleEntitySet}
            />{" "}
            {ts("Combine Searches (advanced)")}
          </label>
        </div>
      )}
    </>
  );
}
