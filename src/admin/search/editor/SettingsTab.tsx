import { useId } from "react";
import { EntityTags } from "../../widgets/EntityTags";
import { useCoreHas } from "../../version";
import type { EditorSearch } from "../editor";

interface SettingsTabProps {
  search: EditorSearch;
  canBeEntitySet: boolean;
  onChange: (change: Partial<EditorSearch>) => void;
  onToggleEntitySet: () => void;
}

/** "YYYY-MM-DD HH:MM:SS" as APIv4 stores it, and the value of a datetime-local input. */
const toInput = (value: string | null | undefined) =>
  value ? value.slice(0, 16).replace(" ", "T") : "";
const fromInput = (value: string) => (value ? `${value.replace("T", " ")}:00` : null);

/** crmSearch-settings: description, timeout, expiry, tags and combining searches. */
export function SettingsTab({
  search,
  canBeEntitySet,
  onChange,
  onToggleEntitySet,
}: SettingsTabProps) {
  // SavedSearch.timeout arrived with 6.20; an older core drops it on save.
  const hasTimeout = useCoreHas({ "6.20": "6.20.alpha1" });
  const id = useId();
  return (
    <>
      <div className="form-group">
        <label htmlFor={`${id}-description`}>{ts("Description")}</label>
        <textarea
          id={`${id}-description`}
          className="form-control"
          rows={3}
          placeholder={ts("None")}
          value={search.description ?? ""}
          onChange={(event) => {
            onChange({ description: event.target.value });
          }}
        />
      </div>
      {hasTimeout && (
        <div className="form-group">
          <label htmlFor={`${id}-timeout`}>{ts("Query Timeout (seconds)")}</label>
          <input
            id={`${id}-timeout`}
            type="number"
            min={0}
            className="form-control six"
            placeholder={ts("Site default")}
            value={search.timeout ?? ""}
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
            value={toInput(search.expires_date)}
            onChange={(event) => {
              onChange({ expires_date: fromInput(event.target.value) });
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
