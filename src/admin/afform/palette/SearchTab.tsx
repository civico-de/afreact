import { useId, useState } from "react";
import { Dropdown } from "../../widgets/Dropdown";
import { Picker } from "../../widgets/Picker";
import { editNode, useEditor } from "../context";
import { FieldValue } from "../FieldValue";
import { getField, type SearchDisplayMeta } from "../meta";
import { textAttribute } from "../model";
import {
  readDisplayFilters,
  stringifyDisplayFilters,
  withoutAttributes,
  type DisplayFilter,
  type FormSearchDisplay,
} from "../nodes";
import { searchDisplayFields } from "../searchDisplay";
import { nodeAt, type ShallowElement } from "../tree";
import { PaletteFieldset, PaletteList } from "./common";
import { placementEntities, searchBlockInUse, searchFieldInUse, searchPalette } from "./lists";
import { MenuLink } from "../../widgets/MenuLink";

/** getFieldEntity(): the entity a filter's field belongs to, by its join prefix. */
function filterEntity(display: SearchDisplayMeta, name: string): string {
  const main = display["saved_search_id.api_entity"];
  const dot = name.indexOf(".");
  if (dot < 0) return main;
  const alias = name.slice(0, dot);
  for (const join of display["saved_search_id.api_params"].join ?? []) {
    const [entity = "", joinAlias] = String(join[0]).split(" AS ");
    if (joinAlias === alias) return entity;
  }
  return main;
}

const elementAt = (layout: Parameters<typeof nodeAt>[0], path: Parameters<typeof nodeAt>[1]) => {
  const node = nodeAt(layout, path);
  if (!node || !("#tag" in node)) throw new Error("The search display is no longer on the form.");
  return node;
};

/** One hidden filter: its field, where its value comes from, and the value. */
function FilterRow({
  display,
  filter,
  fieldOptions,
  onChange,
}: {
  display: SearchDisplayMeta;
  filter: DisplayFilter;
  fieldOptions: { id: string; label: string; group?: string }[];
  onChange: (filter: DisplayFilter | null) => void;
}) {
  const editor = useEditor();
  const id = useId();
  const placements = placementEntities(editor.meta, editor.afform);
  const modeLabel =
    filter.mode === "routeParams"
      ? ts("Url")
      : filter.mode === "val"
        ? ts("Value")
        : (placements.find((each) => each.key === filter.value)?.label ?? filter.value);
  const field = getField(editor.meta, filterEntity(display, filter.name), filter.name);
  return (
    <div className="form-inline">
      <Picker
        id={`${id}-name`}
        label={ts("Filter field")}
        hiddenLabel
        placeholder=" "
        options={fieldOptions}
        value={[filter.name]}
        single
        clearable
        onChange={([name]) => {
          if (name === undefined) onChange(null);
          else if (filter.mode === "routeParams")
            onChange({ ...filter, name: String(name), value: String(name) });
          else onChange({ ...filter, name: String(name) });
        }}
      />
      <div className="input-group">
        <Dropdown
          groupClass="input-group-btn"
          buttonClass="btn btn-default dropdown-toggle"
          title={ts("Filter value source")}
          label={
            <>
              {modeLabel} <span className="caret" />
            </>
          }
        >
          {(close) => (
            <>
              <li>
                <MenuLink
                  onClick={() => {
                    onChange({ ...filter, mode: "routeParams", value: filter.name });
                    close();
                  }}
                >
                  {ts("Url variable")}
                </MenuLink>
              </li>
              <li>
                <MenuLink
                  onClick={() => {
                    onChange({ ...filter, mode: "val", value: "" });
                    close();
                  }}
                >
                  {ts("Fixed value")}
                </MenuLink>
              </li>
              {placements.map((placement) => (
                <li key={placement.key}>
                  <MenuLink
                    onClick={() => {
                      onChange({ ...filter, mode: "options", value: placement.key });
                      close();
                    }}
                  >
                    {placement.label}
                  </MenuLink>
                </li>
              ))}
            </>
          )}
        </Dropdown>
        {filter.mode === "routeParams" && (
          <input
            className="form-control"
            aria-label={ts("Url variable")}
            value={filter.value}
            title={ts("Append %1 to the URL to pass a parameter value to the form", {
              1: `'#/?${filter.value}=value'`,
            })}
            onChange={(event) => {
              onChange({ ...filter, value: event.target.value });
            }}
          />
        )}
        {filter.mode === "val" && field && (
          <span>
            <FieldValue
              id={`${id}-value`}
              field={field}
              value={filter.value}
              onChange={(value) => {
                onChange({ ...filter, value });
              }}
            />
          </span>
        )}
      </div>
    </div>
  );
}

/** afGuiSearch: a search display's tab in the palette. */
export function SearchTab({ display: placed }: { display: FormSearchDisplay }) {
  const editor = useEditor();
  const id = useId();
  const [search, setSearch] = useState("");
  const display = editor.meta.searchDisplays[placed.key];
  if (!display) throw new Error(`No settings for search display ${placed.key}.`);
  const element = elementAt(editor.afform.layout, placed.path);
  const fieldset = elementAt(editor.afform.layout, placed.fieldsetPath);
  const read = readDisplayFilters(textAttribute(element, "filters"));
  const filters = "filters" in read ? read.filters : [];
  const fieldsetChildren = fieldset["#children"] ?? [];
  const inUse = (name: string) => searchFieldInUse(editor.meta, filters, fieldsetChildren, name);
  const options = searchDisplayFields(editor.meta, display).map((option) => ({
    ...option,
    id: String(option.id),
  }));
  const writeFilters = (next: DisplayFilter[]) => {
    const text = stringifyDisplayFilters(next);
    editor.change((afform) =>
      editNode(afform, editor.meta, placed.path, (node) =>
        text ? { ...node, filters: text } : withoutAttributes(node, ["filters"]),
      ),
    );
  };
  const editFieldset = (update: (node: ShallowElement) => ShallowElement) => {
    editor.change((afform) => editNode(afform, editor.meta, placed.fieldsetPath, update));
  };
  const palette = searchPalette(editor.meta, display, search.toLowerCase());
  const storeValues = !!textAttribute(fieldset, "store-values");
  return (
    <div className="af-gui-columns crm-flex-box">
      <fieldset className="af-gui-entity-values">
        <legend>{ts("Hidden Filters:")}</legend>
        {"error" in read && (
          <div className="alert alert-danger" role="alert">
            {ts("These filters cannot be read, so they cannot be edited here: %1", {
              1: read.error,
            })}{" "}
            {ts("Correct them in the Markup tab.")}
          </div>
        )}
        {filters.map((filter, index) => (
          <FilterRow
            key={`${String(index)}:${filter.name}`}
            display={display}
            filter={filter}
            fieldOptions={options.filter(
              (option) => option.id === filter.name || !inUse(option.id),
            )}
            onChange={(next) => {
              writeFilters(
                next
                  ? filters.map((each, at) => (at === index ? next : each))
                  : filters.filter((_, at) => at !== index),
              );
            }}
          />
        ))}
        <hr />
        <div className="form-inline">
          <Picker
            id={`${id}-add-filter`}
            disabled={"error" in read}
            label={ts("Add filter")}
            hiddenLabel
            placeholder={ts("Add filter")}
            options={options.filter((option) => !inUse(option.id))}
            value={[]}
            single
            onChange={([name]) => {
              if (name !== undefined)
                writeFilters([
                  ...filters,
                  { name: String(name), value: String(name), mode: "routeParams" },
                ]);
            }}
          />
        </div>
      </fieldset>
      <PaletteFieldset legend={ts("Form Filters:")} search={search} onSearch={setSearch}>
        <PaletteList
          label={ts("Blocks")}
          items={palette.blocks}
          entity={placed.key}
          inUse={(item) => searchBlockInUse(editor.meta, fieldsetChildren, item.node)}
        />
        <PaletteList
          label={ts("Calculated Fields")}
          items={palette.calculated}
          entity={placed.key}
          inUse={(item) => inUse(textAttribute(item.node, "name") ?? "")}
        />
        {palette.groups.map((group) => (
          <PaletteList
            key={group.label}
            label={group.label}
            items={group.items}
            entity={placed.key}
            inUse={(item) => inUse(textAttribute(item.node, "name") ?? "")}
          />
        ))}
      </PaletteFieldset>
      <fieldset>
        <legend>{ts("Options")}</legend>
        <label>
          {ts("Remember Filters")}{" "}
          <input
            type="checkbox"
            checked={storeValues}
            onChange={() => {
              editFieldset((node) =>
                storeValues
                  ? withoutAttributes(node, ["store-values"])
                  : { ...node, "store-values": "1" },
              );
            }}
          />
        </label>
        <p className="help-block">
          {ts("Filter fields will retain their value when the same user revisits the form.")}
        </p>
      </fieldset>
    </div>
  );
}
