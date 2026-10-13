import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { api4, errorMessage } from "../../../api/civi";
import { Dropdown } from "../../widgets/Dropdown";
import { Picker } from "../../widgets/Picker";
import { editNode, useEditor } from "../context";
import { FieldValue } from "../FieldValue";
import { type GuiField, type SearchDisplayMeta } from "../meta";
import { textAttribute } from "../model";
import {
  readDisplayFilters,
  stringifyDisplayFilters,
  withoutAttributes,
  type DisplayFilter,
  type FormSearchDisplay,
} from "../nodes";
import { searchDisplayEntities, searchDisplayFields } from "../searchDisplay";
import { nodeAt, type ShallowElement } from "../tree";
import { PaletteAdd, PaletteList, PaletteSection, PanelHead, usePaletteSearch } from "./common";
import { placementEntities, searchBlockInUse, searchFieldInUse, searchPalette } from "./lists";
import { MenuLink } from "../../widgets/MenuLink";

/**
 * A filter's field, looked up by its full name in its join's entity and bridge, or in the search's
 * entity. One behind a foreign key (`status_id.is_current_member`) comes from the API.
 * deviation:filter-field-through-join
 */
function useFilterField(display: SearchDisplayMeta, name: string) {
  const editor = useEditor();
  const entities = searchDisplayEntities(editor.meta, display);
  const alias = name.slice(0, name.indexOf(".") + 1);
  const joined = entities.filter((entity) => alias && entity.prefix === alias);
  const owners = joined.length ? joined : entities.filter((entity) => entity.prefix === "");
  const [owner] = owners;
  if (!owner) throw new Error(`No entity for the filter ${name}.`);
  const local = name.slice(owner.prefix.length).split(":")[0] ?? "";
  const known = owners.map((entity) => entity.fields[local]).find(Boolean);
  const calculated = (display.calc_fields ?? []).some((field) => field.name === name);
  const asked = useQuery({
    queryKey: ["afreact-admin", "filterField", owner.name, local],
    enabled: !known && !calculated,
    queryFn: async () => {
      const [field] = await api4<GuiField>(owner.name, "getFields", {
        action: "get",
        loadOptions: ["id", "name", "label"],
        where: [["name", "=", local]],
        select: [
          "name",
          "label",
          "input_type",
          "input_attrs",
          "options",
          "serialize",
          "data_type",
          "fk_entity",
        ],
      });
      if (!field) throw new Error(ts("%1 has no field %2.", { 1: owner.name, 2: local }));
      return field;
    },
  });
  if (known || calculated) return { field: known, calculated, label: null };
  // A custom foreign key is named by its group and field.
  const [first = "", second = ""] = local.split(".");
  const via = owner.fields[first] ?? owner.fields[`${first}.${second}`];
  return {
    field: asked.data,
    calculated,
    error: asked.error,
    label: asked.data
      ? `${owner.label} ${via?.label ?? first}: ${asked.data.label ?? asked.data.name}`
      : name,
  };
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
  const { field, calculated, error, label } = useFilterField(display, filter.name);
  const valueLabel = (
    <label htmlFor={`${id}-value`} className="sr-only">
      {ts("Filter value")}
    </label>
  );
  const options =
    label === null || fieldOptions.some((option) => option.id === filter.name)
      ? fieldOptions
      : [{ id: filter.name, label }, ...fieldOptions];
  const placements = placementEntities(editor.meta, editor.afform);
  const modeLabel =
    filter.mode === "routeParams"
      ? ts("Url")
      : filter.mode === "val"
        ? ts("Value")
        : (placements.find((each) => each.key === filter.value)?.label ?? filter.value);
  // deviation:palette-value-cards
  return (
    <div className="form-inline afreact-value-card">
      <Picker
        id={`${id}-name`}
        label={ts("Filter field")}
        hiddenLabel
        placeholder=" "
        options={options}
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
        {!!error && (
          <span className="crm-error" role="alert">
            {errorMessage(error)}
          </span>
        )}
        {filter.mode === "val" && calculated && (
          <span>
            {valueLabel}
            <input
              id={`${id}-value`}
              className="form-control"
              value={
                typeof filter.value === "string" || typeof filter.value === "number"
                  ? filter.value
                  : JSON.stringify(filter.value)
              }
              onChange={(event) => {
                onChange({ ...filter, value: event.target.value });
              }}
            />
          </span>
        )}
        {filter.mode === "val" && field && (
          <span>
            {valueLabel}
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
  const [search, setSearch] = usePaletteSearch(placed.key);
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
  // Applies the edit to the form's latest filters, so edits batched into one render all land.
  const writeFilters = (edit: (current: DisplayFilter[]) => DisplayFilter[]) => {
    editor.change((afform) =>
      editNode(afform, editor.meta, placed.path, (node) => {
        const current = readDisplayFilters(textAttribute(node, "filters"));
        if (!("filters" in current)) return node;
        const text = stringifyDisplayFilters(edit(current.filters));
        return text ? { ...node, filters: text } : withoutAttributes(node, ["filters"]);
      }),
    );
  };
  const editFieldset = (update: (node: ShallowElement) => ShallowElement) => {
    editor.change((afform) => editNode(afform, editor.meta, placed.fieldsetPath, update));
  };
  const palette = searchPalette(editor.meta, display, search.toLowerCase());
  const storeValues = !!textAttribute(fieldset, "store-values");
  return (
    <form
      className="afreact-palette-sections"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <PanelHead icon={display["type:icon"] ?? "fa-table"} label={display.label} />
      <PaletteSection
        name="search-filters"
        title={ts("Hidden Filters")}
        summary={
          filters.length
            ? ts("1 filter", { plural: "%count filters", count: filters.length })
            : ts("None")
        }
        className="af-gui-entity-values"
      >
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
              // A field is used by one filter only, so its name finds the row in the latest list.
              writeFilters((current) =>
                next
                  ? current.map((each) => (each.name === filter.name ? next : each))
                  : current.filter((each) => each.name !== filter.name),
              );
            }}
          />
        ))}
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
                writeFilters((current) => [
                  ...current,
                  { name: String(name), value: String(name), mode: "routeParams" },
                ]);
            }}
          />
        </div>
      </PaletteSection>
      <PaletteSection
        name="search-options"
        title={ts("Options")}
        summary={storeValues ? ts("Remember Filters") : ts("None")}
      >
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
      </PaletteSection>
      <PaletteAdd name="search-add" title={ts("Form Filters")} search={search} onSearch={setSearch}>
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
      </PaletteAdd>
    </form>
  );
}
