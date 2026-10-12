import { useQuery } from "@tanstack/react-query";
import { createElement, useState } from "react";
import { adminVars } from "../admin/vars";
import { api4, errorMessage } from "../api/civi";
import { Menu } from "../search/Menu";
import type { Link } from "../search/types";
import type { ElementNode } from "./types";
import { Unsupported } from "./Unsupported";

/** The tabs of afAdminFormList whose menu afAdminListMenu fills. */
export const LIST_MENU_TABS = ["form", "search", "block"] as const;
type ListMenuTab = (typeof LIST_MENU_TABS)[number];

export const isListMenuTab = (tab: unknown): tab is ListMenuTab =>
  LIST_MENU_TABS.some((known) => known === tab);

export const listMenuTabNote = (tab: unknown) =>
  `af-admin-list-menu tab=${JSON.stringify(tab ?? null)}`;

export const LIST_MENU_SETTINGS_NOTE = "af-admin-list-menu outside FormBuilder's listing";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === "string" ? value : "");

/** The label of a form type, from afAdmin's Afform field metadata. */
function typeLabel(tab: ListMenuTab): string | null {
  const fields = adminVars().afAdmin?.afform_fields;
  const type = isRecord(fields) ? fields.type : undefined;
  const options = isRecord(type) && Array.isArray(type.options) ? type.options : [];
  const option: unknown = options.find((each) => isRecord(each) && each.name === tab);
  return isRecord(option) && typeof option.label === "string" ? option.label : null;
}

interface EntityLink {
  name: string;
  label: string;
  icon: string;
  type: string;
}

/** afGuiEditor's entities, which a new form or block starts from. */
function entities(): EntityLink[] | null {
  const all = adminVars().afGuiEditor?.entities;
  if (!isRecord(all)) return null;
  return Object.entries(all).flatMap(([name, entity]) =>
    isRecord(entity)
      ? [
          {
            name,
            label: text(entity.label),
            icon: text(entity.icon),
            type: text(entity.type),
          },
        ]
      : [],
  );
}

/** lodash's sortBy order: by UTF-16 code unit, as core sorts these lists. */
// deviation:new-form-choices-sorted
function byLabel(a: Link, b: Link): number {
  const [x, y] = [a.text ?? "", b.text ?? ""];
  return x < y ? -1 : x > y ? 1 : 0;
}

/** As afAdminListMenu's createLinks(): primary entities for forms, every entity for blocks. */
function entityLinks(tab: "form" | "block", all: EntityLink[]): Link[] {
  if (tab === "form")
    return all
      .filter((entity) => entity.type === "primary")
      .map((entity) => ({
        url: `#create/form/${entity.name}`,
        text: entity.label,
        icon: entity.icon,
      }))
      .sort(byLabel);
  const links: Link[] = all
    .map((entity) => ({
      url: `#create/block/${entity.name}`,
      text: entity.label,
      icon: entity.icon || "fa-cog",
    }))
    .sort(
      (a, b) =>
        // deviation:content-block-first
        Number(b.url === "#create/block/*") - Number(a.url === "#create/block/*") || byLabel(a, b),
    );
  // A divider after the content block, as core's list.
  links.splice(1, 0, { separator: true });
  return links;
}

interface SearchRow {
  name: string;
  label: string;
  "display.name": string | null;
  "display.label": string | null;
  "display.type:icon": string | null;
}

/** afGui.getAllSearchDisplays(): each search's default table, then its displays. */
async function searchLinks(): Promise<Link[]> {
  const searches = await api4<SearchRow>("SavedSearch", "get", {
    select: ["name", "label", "display.name", "display.label", "display.type:icon"],
    where: [
      ["api_entity", "IS NOT NULL"],
      ["api_params", "IS NOT NULL"],
      ["is_template", "=", false],
    ],
    join: [["SearchDisplay AS display", "LEFT", ["id", "=", "display.saved_search_id"]]],
    orderBy: { label: "ASC" },
  });
  const links: Link[] = [];
  const seen = new Set<string>();
  for (const search of searches) {
    // One row per display, so each search's default table once.
    if (!seen.has(search.name)) {
      seen.add(search.name);
      links.push({
        url: `#create/search/${search.name}`,
        text: `${search.label}: ${ts("Search results table")}`,
        icon: "fa-table",
      });
    }
    if (search["display.name"])
      links.push({
        url: `#create/search/${search.name}.${search["display.name"]}`,
        // deviation:search-display-label-null
        text: search["display.label"]
          ? `${search.label}: ${search["display.label"]}`
          : search.label,
        icon: search["display.type:icon"] ?? undefined,
      });
  }
  return links;
}

/** af-admin-list-menu: the button that creates a form, search form or block, with its choices. */
export function AdminListMenu({ node }: { node: ElementNode }) {
  const tab = isListMenuTab(node.tab) ? node.tab : null;
  const [opened, setOpened] = useState(false);
  const [filter, setFilter] = useState("");
  const searches = useQuery({
    queryKey: ["afAdminListMenu", "searches"],
    queryFn: searchLinks,
    enabled: opened && tab === "search",
  });
  if (!tab) return <Unsupported what={listMenuTabNote(node.tab)} />;
  const label = typeLabel(tab);
  const known = tab === "search" ? [] : entities();
  if (!label || !known) return <Unsupported what={LIST_MENU_SETTINGS_NOTE} />;
  const links = tab === "search" ? (searches.data ?? null) : entityLinks(tab, known);
  const needle = filter.toLowerCase();
  const shown =
    links && needle
      ? links.filter((link) => !link.separator && (link.text ?? "").toLowerCase().includes(needle))
      : (links ?? []);
  const create = ts("New %1", { 1: label });
  const fallback = tab === "form" ? "#create/form/Individual" : null;
  return createElement(
    "af-admin-list-menu",
    { class: typeof node.class === "string" ? node.class : undefined },
    <Menu
      buttonClass="btn btn-primary dropdown-toggle"
      label={<span className={fallback ? "sr-only" : undefined}>{create}</span>}
      alignRight={false}
      prefix={
        fallback && (
          <a href={fallback} className="btn btn-primary">
            {create}
          </a>
        )
      }
      onOpen={() => {
        setOpened(true);
        setFilter("");
        // deviation:search-choices-load-error
        // A failed load tries again on the next opening.
        if (searches.isError) void searches.refetch();
      }}
      header={
        <li className={links?.length ? undefined : "disabled"}>
          {searches.error ? (
            <span className="crm-error" role="alert">
              {errorMessage(searches.error)}
            </span>
          ) : !links ? (
            <span role="status">
              <i className="crm-i fa-spinner fa-spin" role="img" aria-hidden="true" />
              <span className="sr-only">{ts("Loading…")}</span>
            </span>
          ) : links.length ? (
            <input
              type="search"
              className="form-control"
              placeholder={"\u{1F50D}"}
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
      }
      links={shown}
    />,
  );
}
