import { useId, useState } from "react";
import { api4, errorMessage } from "../../../api/civi";
import { Dropdown } from "../../widgets/Dropdown";
import { InlineEdit } from "../../widgets/InlineEdit";
import { TabList, TabPanel, type TabItem } from "../../widgets/Tabs";
import { editNode, useEditor, type FormEntity } from "../context";
import type { FormSearchDisplay } from "../nodes";
import { ElementsTab } from "./ElementsTab";
import { EntityTab } from "./EntityTab";
import { SearchTab } from "./SearchTab";
import { SettingsTab } from "./SettingsTab";
import { MenuLink } from "../../widgets/MenuLink";

/** An entry of the "Add Search" menu: a search's default table or one of its displays. */
export interface SearchOption {
  key: string;
  label: string;
  tag: string;
  icon: string;
}

interface SearchRow {
  name: string;
  label: string;
  "display.name": string | null;
  "display.label": string | null;
  "display.type:name": string | null;
  "display.type:icon": string | null;
}

/** afGui.getAllSearchDisplays(): every search's default table, then its displays. */
export async function searchOptions(): Promise<SearchOption[]> {
  const rows = await api4<SearchRow>("SavedSearch", "get", {
    select: [
      "name",
      "label",
      "display.name",
      "display.label",
      "display.type:name",
      "display.type:icon",
    ],
    where: [
      ["api_entity", "IS NOT NULL"],
      ["api_params", "IS NOT NULL"],
      ["is_template", "=", false],
    ],
    join: [["SearchDisplay AS display", "LEFT", ["id", "=", "display.saved_search_id"]]],
    orderBy: { label: "ASC" },
  });
  const options: SearchOption[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!seen.has(row.name)) {
      seen.add(row.name);
      options.push({
        key: row.name,
        label: `${row.label}: ${ts("Search results table")}`,
        tag: "crm-search-display-table",
        icon: "fa-table",
      });
    }
    if (row["display.name"])
      options.push({
        key: `${row.name}.${row["display.name"]}`,
        label: `${row.label}: ${row["display.label"] ?? ""}`,
        tag: row["display.type:name"] ?? "",
        icon: row["display.type:icon"] ?? "",
      });
  }
  return options;
}

function AddEntityMenu({ onAdd }: { onAdd: (type: string) => void }) {
  const editor = useEditor();
  return (
    <Dropdown
      groupClass="dropdown"
      buttonClass="btn btn-link dropdown-toggle"
      title={ts("Add Entity")}
      label={<i className="crm-i fa-plus" role="img" aria-hidden="true" />}
    >
      {(close) =>
        Object.entries(editor.meta.gui.entities)
          .filter(([, entity]) => entity.defaults)
          .map(([type, entity]) => (
            <li key={type}>
              <MenuLink
                onClick={() => {
                  close();
                  onAdd(type);
                }}
              >
                <i className={`crm-i ${entity.icon ?? ""}`} role="img" aria-hidden="true" />{" "}
                {entity.label}
              </MenuLink>
            </li>
          ))
      }
    </Dropdown>
  );
}

function AddSearchMenu({ onAdd }: { onAdd: (option: SearchOption) => void }) {
  const [options, setOptions] = useState<SearchOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const load = () => {
    setFilter("");
    if (options) return;
    searchOptions().then(setOptions, (failure: unknown) => {
      setError(errorMessage(failure));
    });
  };
  const term = filter.toLowerCase();
  const shown = (options ?? []).filter((option) => option.label.toLowerCase().includes(term));
  return (
    <Dropdown
      groupClass="dropdown"
      buttonClass="btn btn-link dropdown-toggle"
      title={ts("Add Search")}
      label={<i className="crm-i fa-plus" role="img" aria-hidden="true" />}
      onOpen={load}
    >
      {(close) => (
        <>
          <li className={options?.length ? undefined : "disabled"}>
            {error ? (
              <span className="crm-error" role="alert">
                {error}
              </span>
            ) : !options ? (
              <span role="status">
                <i className="crm-i fa-spinner fa-spin" role="img" aria-hidden="true" />
                <span className="sr-only">{ts("Loading…")}</span>
              </span>
            ) : options.length ? (
              <input
                type="search"
                className="form-control"
                placeholder="&#x1f50d;"
                aria-label={ts("Filter")}
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                }}
              />
            ) : (
              <span>{ts("None Found")}</span>
            )}
          </li>
          {shown.map((option) => (
            <li key={option.key}>
              <MenuLink
                onClick={() => {
                  close();
                  onAdd(option);
                }}
              >
                <i className={`crm-i ${option.icon}`} role="img" aria-hidden="true" />{" "}
                {option.label}
              </MenuLink>
            </li>
          ))}
        </>
      )}
    </Dropdown>
  );
}

/** editor.scrollToEntity(): the page scrolls the entity's first fieldset to the top. */
export function scrollToEntity(name: string) {
  const fieldset = document
    .getElementById("afGuiEditor-canvas-body")
    ?.querySelector(`.af-gui-container-type-fieldset[data-entity="${CSS.escape(name)}"]`);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  fieldset?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
}

const SETTINGS = "settings";
const EXTRA = "extra";

/** afGuiEditorPalette: the form's settings, its elements, its entities and its searches. */
export function Palette({
  displays,
  loading,
  link,
  onAddEntity,
  onAddSearch,
}: {
  displays: FormSearchDisplay[];
  /** Entities and displays whose metadata is still loading. */
  loading: string[];
  link: string | null;
  onAddEntity: (type: string) => void;
  onAddSearch: (option: SearchOption) => void;
}) {
  const editor = useEditor();
  const base = useId();
  const configurable = editor.afform.type === "form";
  const active = editor.selected ?? SETTINGS;
  const editable = (entity: FormEntity) =>
    configurable && active === entity.name && entity.path !== null;
  const spinner = <i className="crm-i fa-spin fa-spinner" role="img" aria-hidden="true" />;
  const items: TabItem[] = [
    {
      key: SETTINGS,
      title: ts("Form Settings"),
      className: "fluid-width-tab",
      label: (
        <>
          <i className="crm-i fa-gear" role="img" aria-hidden="true" />{" "}
          <span>{ts("Settings")}</span>
        </>
      ),
    },
    {
      key: EXTRA,
      title: ts("Elements"),
      className: "fluid-width-tab",
      label: (
        <>
          <i className="crm-i fa-rectangle-list" role="img" aria-hidden="true" />{" "}
          <span>{ts("Elements")}</span>
        </>
      ),
    },
    ...editor.entities.map((entity): TabItem => {
      const icon = (
        <i
          className={`crm-i ${editor.meta.gui.entities[entity.type]?.icon ?? ""}`}
          role="img"
          aria-hidden="true"
        />
      );
      return {
        key: entity.name,
        title: entity.label,
        className: "fluid-width-tab",
        label: editable(entity) ? (
          <>
            {icon} <span className="sr-only">{entity.label}</span>
          </>
        ) : (
          <>
            {icon} <span>{entity.label}</span>
          </>
        ),
      };
    }),
    ...displays.map((display): TabItem => {
      const settings = editor.meta.searchDisplays[display.key];
      return {
        key: display.key,
        title: settings?.label ?? display.key,
        className: "fluid-width-tab",
        label: settings ? (
          <>
            <i className={`crm-i ${settings["type:icon"] ?? ""}`} role="img" aria-hidden="true" />{" "}
            <span>{settings.label}</span>
          </>
        ) : (
          <>
            {spinner} <span className="sr-only">{ts("Loading…")}</span>
          </>
        ),
      };
    }),
  ];
  const selectedEntity = editor.entities.find((entity) => entity.name === active);
  const labelPath = selectedEntity && editable(selectedEntity) ? selectedEntity.path : null;
  const selectedDisplay = displays.find((display) => display.key === active);
  return (
    <div id="afGuiEditor-palette-config" className="panel panel-default">
      <div className="panel-heading afreact-palette-heading">
        <TabList
          base={base}
          items={items}
          active={active}
          label={ts("Form parts")}
          onSelect={(key) => {
            if (key === SETTINGS) editor.select(null);
            else if (displays.some((display) => display.key === key)) {
              if (editor.meta.searchDisplays[key]) editor.select(key);
            } else {
              editor.select(key);
              if (key !== EXTRA) scrollToEntity(key);
            }
          }}
        />
        {selectedEntity && labelPath && (
          <InlineEdit
            className="afreact-tab-label"
            label={ts("Label of %1", { 1: selectedEntity.name })}
            value={selectedEntity.label}
            onChange={(label) => {
              editor.change((afform) =>
                editNode(afform, editor.meta, labelPath, (node) => ({ ...node, label })),
              );
            }}
          />
        )}
        {loading.length > 0 && <span role="status">{spinner}</span>}
        {(configurable || editor.afform.type === "search") && (
          <ul className="nav nav-tabs afreact-palette-add" role="none">
            <li role="none">
              {configurable ? (
                <AddEntityMenu onAdd={onAddEntity} />
              ) : (
                <AddSearchMenu onAdd={onAddSearch} />
              )}
            </li>
          </ul>
        )}
      </div>
      <TabPanel base={base} tab={active} active={active} className="panel-body">
        {active === SETTINGS && <SettingsTab />}
        {active === EXTRA && <ElementsTab />}
        {selectedEntity && <EntityTab entity={selectedEntity} link={link} />}
        {selectedDisplay && editor.meta.searchDisplays[selectedDisplay.key] && (
          <SearchTab display={selectedDisplay} />
        )}
      </TabPanel>
    </div>
  );
}
