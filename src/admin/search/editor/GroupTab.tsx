import { useEffect, useEffectEvent, useId } from "react";
import { Picker } from "../../widgets/Picker";
import type { EditorSearch, SmartGroup } from "../editor";
import { getEntity, getSmartGroupColumns } from "../expr";
import { useFieldOptions, type SearchAdminMetadata } from "../meta";
import { SearchInput } from "../SearchInput";

interface GroupTabProps {
  meta: SearchAdminMetadata;
  search: EditorSearch;
  onGroup: (group: SmartGroup) => void;
  onSelect: (select: string[]) => void;
}

/** crmSearchAdminGroup: the smart group's title, contact column, type, visibility and custom fields. */
export function GroupTab({ meta, search, onGroup, onSelect }: GroupTabProps) {
  const id = useId();
  const group = search.groups[0];
  const columns = getSmartGroupColumns(meta, search);
  const select = search.api_params.select;
  const options = useFieldOptions("Group");
  const fields = getEntity(meta, "Group")?.fields ?? [];
  const field = (name: string) => fields.find((f) => f.name === name);
  // The contact column leads the select clause, as the group's members come from it.
  const first = select[0];
  const leading = columns[0]?.id;
  const lead = useEffectEvent(() => {
    if (leading !== undefined && !columns.some((col) => col.id === first))
      onSelect([String(leading), ...select]);
  });
  // Once, when the tab opens, as core's $onInit.
  useEffect(() => {
    lead();
  }, []);
  if (!group) return null;
  const set = (change: Partial<SmartGroup>) => {
    onGroup({ ...group, ...change });
  };
  const disabled = !columns.length;
  const typeField = field("group_type");
  const visibility = field("visibility");
  const description = field("description");
  const custom = fields.filter((f) => f.name.includes(".") && f.entity === "Group");
  return (
    <>
      {disabled && (
        <div className="alert alert-warning">
          {ts("Unable to create smart group because this search does not include any contacts.")}
        </div>
      )}
      <div className="form-inline">
        <label htmlFor="crm-search-admin-group-title">
          {ts("Group Title")} <span className="crm-marker">*</span>
        </label>{" "}
        <input
          id="crm-search-admin-group-title"
          className="form-control"
          placeholder={ts("Untitled")}
          value={group.title}
          disabled={disabled}
          required={!disabled}
          onChange={(event) => {
            set({ title: event.target.value });
          }}
        />{" "}
        <label htmlFor={`${id}-column`}>{ts("Contact Column")}</label>{" "}
        <Picker
          id={`${id}-column`}
          externalLabel
          label={ts("Contact Column")}
          placeholder=" "
          single
          options={columns}
          value={first ? [first] : []}
          onChange={(picked) => {
            const next = picked[0];
            if (next !== undefined) onSelect([String(next), ...select.slice(1)]);
          }}
        />
      </div>
      {!disabled && (
        <fieldset>
          <legend className="sr-only">{ts("Smart Group")}</legend>
          <label htmlFor={`${id}-description`}>{description?.label ?? ts("Description")}</label>
          <textarea
            id={`${id}-description`}
            className="form-control"
            value={group.description}
            onChange={(event) => {
              set({ description: event.target.value });
            }}
          />
          {options.data ? (
            <>
              {typeField && (
                <fieldset className="form-inline">
                  <legend>{typeField.label}</legend>
                  {(options.data.group_type ?? []).map((option) => (
                    <label key={option.id} className="checkbox-inline">
                      <input
                        type="checkbox"
                        checked={group.group_type.map(String).includes(String(option.id))}
                        onChange={(event) => {
                          const value = String(option.id);
                          set({
                            group_type: event.target.checked
                              ? [...group.group_type, value]
                              : group.group_type.filter((t) => String(t) !== value),
                          });
                        }}
                      />{" "}
                      {option.label}
                    </label>
                  ))}
                </fieldset>
              )}
              {visibility && (
                <div className="form-inline">
                  <label htmlFor={`${id}-visibility`}>{visibility.label}</label>{" "}
                  <SearchInput
                    id={`${id}-visibility`}
                    field={visibility}
                    options={options.data.visibility}
                    value={group.visibility}
                    onChange={(value) => {
                      set({ visibility: typeof value === "string" ? value : String(value) });
                    }}
                  />
                </div>
              )}
              <hr />
              {custom.map((customField) => (
                <div className="form-inline" key={customField.name}>
                  <label htmlFor={`${id}-${customField.name}`}>{customField.label}</label>{" "}
                  <SearchInput
                    id={`${id}-${customField.name}`}
                    field={customField}
                    options={options.data?.[customField.name]}
                    value={group[customField.name]}
                    onChange={(value) => {
                      set({ [customField.name]: value });
                    }}
                  />
                </div>
              ))}
            </>
          ) : (
            <p role="status">{ts("Loading…")}</p>
          )}
        </fieldset>
      )}
    </>
  );
}
