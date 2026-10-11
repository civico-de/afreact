import { api4 } from "../../api/civi";

/** A tab of the saved search listing, as core's searchList controller declares it. */
export type ListTab = "custom" | "template" | "segment" | "packaged";
export const LIST_TABS: ListTab[] = ["custom", "template", "segment", "packaged"];

export const isListTab = (value: unknown): value is ListTab =>
  typeof value === "string" && LIST_TABS.some((tab) => tab === value);

export interface ListFilters {
  label: string;
  author: string;
  modules: string[];
  entities: string[];
  tags: number[];
}

export const NO_FILTERS: ListFilters = {
  label: "",
  author: "",
  modules: [],
  entities: [],
  tags: [],
};

export type SortDirection = "ASC" | "DESC";
export type ListSort = [string, SortDirection];

/** A SavedSearch row of the listing query; aggregates arrive as lists. */
export interface ListedSearch {
  id: number;
  name: string;
  label: string;
  description: string | null;
  api_entity: string;
  api_params: Record<string, unknown>;
  "api_entity:label": string | null;
  is_template: boolean;
  created_id: number | null;
  "created_id.display_name": string | null;
  "modified_id.display_name": string | null;
  created_date: string | null;
  modified_date: string | null;
  expires_date: string | null;
  has_base: boolean;
  "base_module:label": string | null;
  local_modified_date: string | null;
  display_name: string[] | null;
  display_label: string[] | null;
  display_icon: string[] | null;
  display_acl_bypass: boolean[] | null;
  tag_id: number[] | null;
  group_id: number[] | null;
  groups: string[] | null;
  schedule_id?: number[] | null;
  schedule_title?: string[] | null;
}

/** The fixed where clause of each tab (searchList's `filters`). */
const TAB_WHERE: Record<Exclude<ListTab, "segment">, unknown[][]> = {
  custom: [["has_base", "=", false]],
  template: [["is_template", "=", true]],
  packaged: [["has_base", "=", true]],
};

/** crmSearchAdminSearchListing's search, as one SavedSearch.get call for a page of a tab. */
export function listingParams(
  tab: Exclude<ListTab, "segment">,
  filters: ListFilters,
  sort: ListSort,
  page: number,
  limit: number,
  communications: boolean,
) {
  const select = [
    "id",
    "name",
    "label",
    "description",
    "api_entity",
    "api_entity:label",
    "api_params",
    "is_template",
    "created_id",
    "created_id.display_name",
    "modified_id.display_name",
    "created_date",
    "modified_date",
    "expires_date",
    "has_base",
    "base_module:label",
    "local_modified_date",
    "GROUP_CONCAT(UNIQUE display.name ORDER BY display.label) AS display_name",
    "GROUP_CONCAT(UNIQUE display.label ORDER BY display.label) AS display_label",
    "GROUP_CONCAT(UNIQUE display.type:icon ORDER BY display.label) AS display_icon",
    "GROUP_CONCAT(UNIQUE display.acl_bypass ORDER BY display.label) AS display_acl_bypass",
    "GROUP_CONCAT(UNIQUE entity_tag.tag_id) AS tag_id",
    "GROUP_CONCAT(UNIQUE group.id) AS group_id",
    "GROUP_CONCAT(UNIQUE group.title) AS groups",
    "row_count",
  ];
  const join: unknown[][] = [
    ["SearchDisplay AS display", "LEFT", ["id", "=", "display.saved_search_id"]],
    ["Group AS group", "LEFT", ["id", "=", "group.saved_search_id"]],
    [
      "EntityTag AS entity_tag",
      "LEFT",
      ["entity_tag.entity_table", "=", '"civicrm_saved_search"'],
      ["id", "=", "entity_tag.entity_id"],
    ],
  ];
  if (communications) {
    select.push(
      "GROUP_CONCAT(UNIQUE schedule.id ORDER BY schedule.title) AS schedule_id",
      "GROUP_CONCAT(UNIQUE schedule.title ORDER BY schedule.title) AS schedule_title",
    );
    join.push([
      "ActionSchedule AS schedule",
      "LEFT",
      ["schedule.mapping_id", "=", '"saved_search"'],
      ["id", "=", "schedule.entity_value"],
    ]);
  }
  const where: unknown[][] = [
    ["api_entity", "IS NOT NULL"],
    ["is_current", "=", true],
    ...TAB_WHERE[tab],
  ];
  const label = filters.label.trim();
  if (label) where.push(["label", "CONTAINS", label]);
  const author = filters.author.trim();
  if (tab === "custom" && author)
    where.push([
      "OR",
      [
        ["created_id.display_name", "CONTAINS", author],
        ["modified_id.display_name", "CONTAINS", author],
      ],
    ]);
  if (tab !== "custom" && filters.modules.length)
    where.push(["base_module", "IN", filters.modules]);
  if (filters.entities.length) where.push(["api_entity", "IN", filters.entities]);
  if (filters.tags.length) where.push(["tags", "IN", filters.tags]);
  return {
    select,
    join,
    where,
    groupBy: ["id"],
    orderBy: { [sort[0]]: sort[1] },
    limit,
    offset: (page - 1) * limit,
  };
}

export interface Permissions {
  superAdmin: boolean;
  administer: boolean;
  manageOwn: boolean;
  /** Whether scheduled communications is enabled, and whether the user may schedule them. */
  communications: boolean;
  schedule: boolean;
  cid: number | undefined;
}

export function currentPermissions(modules: Record<string, string>): Permissions {
  const can = window.CRM.checkPerm;
  return {
    superAdmin: can("all CiviCRM permissions and ACLs"),
    administer: can("administer search_kit"),
    manageOwn: can("manage own search_kit"),
    communications: "scheduled_communications" in modules,
    schedule: can("schedule communications"),
    cid: window.CRM.config?.cid,
  };
}

/** The listing's onPostRun: who may edit or delete a row. */
export function rowAccess(row: ListedSearch, perms: Permissions) {
  let edit = perms.superAdmin || !(row.display_acl_bypass ?? []).includes(true);
  if (!perms.administer && perms.manageOwn && perms.cid !== row.created_id) edit = false;
  const remove = edit;
  if (!row["api_entity:label"]) edit = false;
  if (perms.communications && !perms.schedule && row.schedule_id?.length) edit = false;
  return { edit, remove };
}

/** A form embedding one of the search's displays (crmSearchAdminSearchListing.loadAfforms). */
export interface EmbeddingForm {
  title: string;
  name: string;
}

export async function loadEmbeddingForms(): Promise<Record<string, EmbeddingForm[]>> {
  const afforms = await api4<{ name: string; title: string; search_displays: string[] }>(
    "Afform",
    "get",
    {
      select: ["search_displays", "name", "title", "server_route"],
      where: [
        ["type", "=", "search"],
        ["search_displays", "IS NOT EMPTY"],
      ],
    },
  );
  const bySearch: Record<string, EmbeddingForm[]> = {};
  for (const afform of afforms) {
    for (const searchName of new Set(afform.search_displays.map((d) => d.split(".")[0] ?? ""))) {
      (bySearch[searchName] ??= []).push({ title: afform.title, name: afform.name });
    }
  }
  return bySearch;
}

export interface Consequence {
  text: string;
  /** Lost data, shown as an error with a warning icon. */
  severe: boolean;
  /** A form icon before the text. */
  form?: boolean;
}

/** deleteOrRevert's message: what else a delete removes or a revert resets. */
export function consequences(row: ListedSearch, forms: EmbeddingForm[]): Consequence[] {
  const revert = !!row["base_module:label"];
  const displays = row.display_label?.length ?? 0;
  const list: Consequence[] = [];
  if (displays === 1)
    list.push({
      text: revert
        ? ts("Includes 1 display which will also be reverted.")
        : ts("Includes 1 display which will also be deleted."),
      severe: false,
    });
  else if (displays > 1)
    list.push({
      text: revert
        ? ts("Includes %1 displays which will also be reverted.", { 1: displays })
        : ts("Includes %1 displays which will also be deleted.", { 1: displays }),
      severe: false,
    });
  for (const group of row.groups ?? [])
    list.push(
      revert
        ? {
            text: ts('Smart group "%1" will be reset to the packaged search criteria.', {
              1: group,
            }),
            severe: false,
          }
        : { text: ts('Smart group "%1" will also be deleted.', { 1: group }), severe: true },
    );
  if (!revert)
    for (const title of row.schedule_title ?? [])
      list.push({
        text: ts('Communication "%1" will also be deleted.', { 1: title }),
        severe: true,
      });
  for (const form of forms)
    list.push(
      revert
        ? {
            text: ts(
              'Form "%1" will be affected because it contains an embedded display from this search.',
              { 1: form.title },
            ),
            severe: false,
            form: true,
          }
        : {
            text: ts(
              'Form "%1" will also be deleted because it contains an embedded display from this search.',
              { 1: form.title },
            ),
            severe: true,
          },
    );
  return list;
}

/** deleteSearch / revertSearch. */
export function deleteOrRevertCall(row: ListedSearch): [string, string, object] {
  if (!row["base_module:label"]) return ["SavedSearch", "delete", { where: [["id", "=", row.id]] }];
  return [
    "SavedSearch",
    "revert",
    {
      where: [["id", "=", row.id]],
      chain: {
        revertDisplays: [
          "SearchDisplay",
          "revert",
          {
            where: [
              ["saved_search_id", "=", "$id"],
              ["has_base", "=", true],
            ],
          },
        ],
        deleteDisplays: [
          "SearchDisplay",
          "delete",
          {
            where: [
              ["saved_search_id", "=", "$id"],
              ["has_base", "=", false],
            ],
          },
        ],
      },
    },
  ];
}
