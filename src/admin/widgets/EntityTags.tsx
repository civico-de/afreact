import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { api4, errorMessage } from "../../api/civi";

export interface TagRecord {
  id: number;
  label: string;
  color: string | null;
  is_selectable: boolean;
  description: string | null;
}

interface EntityTagsProps {
  entityTable: string;
  /** Omitted for an unsaved record: changes go to onChange only, the caller saves them. */
  entityId?: number;
  tagIds: number[];
  onChange: (tagIds: number[]) => void;
  /** Without it the tags only show as badges. */
  editable?: boolean;
}

const tagsKey = (entityTable: string) => ["crmEntityTags", entityTable];

/** One Tag.get per entity table for the page, as crmEntityTagsCache. */
export function useTags(entityTable: string) {
  return useQuery({
    queryKey: tagsKey(entityTable),
    queryFn: () =>
      api4<TagRecord>("Tag", "get", {
        select: ["id", "name", "label", "color", "is_selectable", "description"],
        where: [["used_for", "CONTAINS", entityTable]],
      }),
    staleTime: Infinity,
  });
}

function randomColor(): string {
  return `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0")}`;
}

export function TagBadge({ tag }: { tag: TagRecord }) {
  const style = tag.color
    ? { backgroundColor: tag.color, color: window.CRM.utils.colorContrast(tag.color) }
    : undefined;
  return (
    <span className="badge" style={style} title={tag.description ?? undefined}>
      {tag.label}
    </span>
  );
}

/** crmEntityTags: the applied tags as badges, and a panel to toggle or create tags. */
export function EntityTags({
  entityTable,
  entityId,
  tagIds,
  onChange,
  editable = true,
}: EntityTagsProps) {
  const id = useId();
  const client = useQueryClient();
  const tags = useTags(entityTable);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [color, setColor] = useState(randomColor);
  const searchInput = useRef<HTMLInputElement>(null);
  // The panel opens to type a tag.
  useEffect(() => {
    if (open) searchInput.current?.focus();
  }, [open]);
  const all = tags.data ?? [];
  const byId = new Map(all.map((tag) => [tag.id, tag]));
  const term = search.trim().toLowerCase();
  const offered = all.filter((tag) => tag.is_selectable && tag.label.toLowerCase().includes(term));

  async function toggle(tag: TagRecord) {
    const has = tagIds.includes(tag.id);
    const next = has ? tagIds.filter((t) => t !== tag.id) : [...tagIds, tag.id];
    if (entityId === undefined) {
      onChange(next);
      return;
    }
    const status = window.CRM.status({});
    try {
      if (has)
        await api4("EntityTag", "delete", {
          where: [
            ["entity_id", "=", entityId],
            ["tag_id", "=", tag.id],
            ["entity_table", "=", entityTable],
          ],
        });
      else
        await api4("EntityTag", "create", {
          values: { entity_id: entityId, tag_id: tag.id, entity_table: entityTable },
        });
      status.resolve();
      onChange(next);
    } catch (error) {
      status.reject();
      window.CRM.alert(errorMessage(error), ts("Error"), "error");
    }
  }

  async function create() {
    const label = search.trim();
    try {
      const [tag] = await api4<TagRecord>("Tag", "create", {
        values: { label, color, is_selectable: true, used_for: [entityTable] },
      });
      if (!tag) return;
      client.setQueryData<TagRecord[]>(tagsKey(entityTable), (old) => [...(old ?? []), tag]);
      setSearch("");
      setColor(randomColor());
      await toggle(tag);
    } catch (error) {
      window.CRM.alert(errorMessage(error), ts("Error"), "error");
    }
  }

  function close(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    setOpen(false);
    document.getElementById(`${id}-button`)?.focus();
  }

  const badges = tagIds.flatMap((tagId) => {
    const tag = byId.get(tagId);
    return tag ? [<TagBadge key={tagId} tag={tag} />] : [];
  });
  if (!editable) return <span className="crm-entity-tags">{badges}</span>;
  return (
    <span className="crm-entity-tags btn-group btn-group-xs" onKeyDown={close}>
      <button
        id={`${id}-button`}
        type="button"
        className="btn btn-secondary-outline"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <i className="crm-i fa-tag" role="img" aria-hidden="true" />{" "}
        <span className="crm-entity-tags-btn-label">{ts("Tags")}</span>
      </button>
      {badges}
      {open && (
        <div id={`${id}-panel`} className="afreact-tags-panel" role="group" aria-label={ts("Tags")}>
          <input
            type="search"
            className="form-control"
            aria-label={ts("Add tag...")}
            placeholder={ts("Add tag...")}
            value={search}
            ref={searchInput}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
          {search.trim().length > 1 && (
            <div className="form-inline afreact-tags-create">
              <label htmlFor={`${id}-color`}>{ts("Color")}</label>
              <input
                id={`${id}-color`}
                type="color"
                value={color}
                onChange={(event) => {
                  setColor(event.target.value);
                }}
              />
              <button
                type="button"
                className="btn btn-xs btn-secondary"
                onClick={() => void create()}
              >
                {ts("Create Tag")}: {search.trim()}
              </button>
            </div>
          )}
          {tags.error ? (
            <p className="crm-error">{errorMessage(tags.error)}</p>
          ) : (
            <ul className="list-unstyled">
              {offered.map((tag) => (
                <li key={tag.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={tagIds.includes(tag.id)}
                      onChange={() => void toggle(tag)}
                    />{" "}
                    <span
                      className="crm-entity-tags-tag-color"
                      style={tag.color ? { backgroundColor: tag.color } : undefined}
                    />
                    {tag.label}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </span>
  );
}
