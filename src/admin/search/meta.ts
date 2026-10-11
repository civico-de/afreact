import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api4 } from "../../api/civi";
import { adminVars } from "../vars";

/** `CRM.crmSearchAdmin` as `Civi\Search\Admin::getAdminSettings()` gives it. */
export interface SearchAdminSettings {
  defaultPagerSize: number;
  modules: Record<string, string>;
  cacheKey: string;
  defaultDistanceUnit?: string;
  tags: {
    id: number;
    label: string;
    color: string | null;
    is_selectable: boolean;
    description: string | null;
  }[];
}

export interface SchemaField {
  name: string;
  label: string;
  title?: string;
  data_type: string;
  input_type?: string | null;
  fk_entity?: string | null;
  options?: boolean | unknown[];
  suffixes?: string[] | null;
  type?: string;
  [key: string]: unknown;
}

export interface SchemaEntity {
  name: string;
  title: string;
  title_plural: string;
  icon?: string | null;
  type?: string[];
  primary_key: string[];
  label_field?: string | null;
  searchable?: string;
  fields: SchemaField[];
  [key: string]: unknown;
}

/** What `civicrm/ajax/admin/search` answers (`Civi\Search\Admin::getAdminMetadata()`). */
export interface SearchAdminMetadata {
  schema: SchemaEntity[];
  joins: Record<string, unknown[]>;
  pseudoFields: SchemaField[];
  operators: { key: string; value: string }[];
  permissions: unknown[];
  functions: { name: string; title: string; category: string; [key: string]: unknown }[];
  displayTypes: {
    id: number;
    name: string;
    label: string;
    description: string;
    icon: string;
    grouping?: string;
  }[];
  styles: { key: string; value: string }[];
  defaultDisplay: Record<string, unknown>;
  [key: string]: unknown;
}

export function searchAdminSettings(): SearchAdminSettings {
  const settings = adminVars().searchAdmin;
  if (!settings) throw new Error("The SearchKit builder page carries no admin settings.");
  return settings;
}

const isMetadata = (value: unknown): value is SearchAdminMetadata =>
  typeof value === "object" && value !== null && "schema" in value && Array.isArray(value.schema);

/** core's localStorage name, so both builders share one copy. */
const cacheName = () =>
  `searchMeta${String(window.CRM.config?.cid ?? "")}${window.CRM.config?.lcMessages ?? ""}`;

/**
 * The admin metadata, from core's browser cache while its key matches the server's, otherwise
 * fetched and cached, as `searchMeta.loadMetadata()` does.
 */
export async function loadSearchMetadata(fresh = false): Promise<SearchAdminMetadata> {
  const { cacheKey } = searchAdminSettings();
  const cached = window.CRM.cache?.get(cacheName());
  if (!fresh && isMetadata(cached) && cached.cacheKey === cacheKey) return cached;
  const response = await fetch(window.CRM.url("civicrm/ajax/admin/search"));
  if (!response.ok) throw new Error(`SearchKit metadata: HTTP ${String(response.status)}`);
  const data: unknown = await response.json();
  if (!isMetadata(data)) throw new Error("SearchKit metadata answered without a schema.");
  const metadata = { ...data, cacheKey };
  window.CRM.cache?.set(cacheName(), metadata);
  return metadata;
}

export function useSearchMetadata() {
  return useQuery({
    queryKey: ["afreact-admin", "searchMetadata"],
    queryFn: () => loadSearchMetadata(),
    staleTime: Infinity,
  });
}

export const entityOf = (metadata: SearchAdminMetadata, name: string) =>
  metadata.schema.find((entity) => entity.name === name);

/** Re-reads the metadata after an import or a new entity, as `searchMeta.refreshMetadata()`. */
export function useRefreshSearchMetadata() {
  const client = useQueryClient();
  return () =>
    client.fetchQuery({
      queryKey: ["afreact-admin", "searchMetadata"],
      queryFn: () => loadSearchMetadata(true),
      staleTime: 0,
    });
}

/** getPrimaryAndSecondaryEntitySelect: primary entities, then the secondary ones under "More...". */
export function entitySelect(
  metadata: SearchAdminMetadata,
): { id: string; label: string; icon?: string | null; group?: string }[] {
  const of = (searchable: string) =>
    metadata.schema.filter((entity) => entity.searchable === searchable && entity.fields.length);
  return [
    ...of("primary").map((entity) => ({
      id: entity.name,
      label: entity.title_plural,
      icon: entity.icon,
    })),
    ...of("secondary").map((entity) => ({
      id: entity.name,
      label: entity.title_plural,
      icon: entity.icon,
      group: ts("More..."),
    })),
  ];
}

export interface FieldOption {
  id: string | number;
  name?: string;
  label: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
}

/** loadFieldOptions: the option lists of an entity's fields that have a `:name` suffix. */
export function useFieldOptions(entity: string | undefined) {
  return useQuery({
    queryKey: ["afreact-admin", "fieldOptions", entity],
    queryFn: async () => {
      const fields = await api4<{ name: string; options: FieldOption[] | false }>(
        entity ?? "",
        "getFields",
        {
          loadOptions: ["id", "name", "label", "description", "color", "icon"],
          where: [
            ["options", "!=", false],
            ["suffixes", "CONTAINS", "name"],
          ],
          select: ["name", "options"],
        },
      );
      return Object.fromEntries(
        fields.flatMap((field) =>
          Array.isArray(field.options) ? [[field.name, field.options]] : [],
        ),
      );
    },
    enabled: !!entity,
    staleTime: Infinity,
  });
}
