import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { InlineEdit } from "../../widgets/InlineEdit";
import { usePaletteItem } from "../canvas/dnd";
import { useBlockLayout } from "../canvas/Container";
import type { ContainerScope } from "../canvas/dropRules";
import { knownEntityType } from "../canvas/scope";
import { useEditor } from "../context";
import type { BlockMeta, EditorMeta } from "../meta";
import type { PaletteItem } from "./lists";
import { blockContents, blockIcon, elementSummary, fieldSummary } from "./summary";

/**
 * One palette entry, a tile telling what it adds, dragged onto the canvas; a disabled one stays
 * put, as core's `.disabled`.
 */
function PaletteEntry({
  item,
  entity,
  disabled,
}: {
  item: PaletteItem;
  entity: string | null;
  disabled: boolean;
}) {
  const target = item.entity === undefined ? entity : item.entity;
  const drag = usePaletteItem(
    `${target ?? ""}:${item.key}`,
    { kind: "new", node: item.node, entity: target, label: item.title },
    disabled,
  );
  const id = useId();
  return (
    <div className={disabled ? "disabled" : undefined}>
      <div
        ref={drag.ref}
        className={`af-gui-palette-item afreact-palette-tile${drag.dragging ? " afreact-dragging" : ""}`}
        {...drag.props}
        aria-disabled={disabled || undefined}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-about`}
      >
        <span id={`${id}-title`} className="afreact-tile-title">
          {item.title}
        </span>
        <div id={`${id}-about`} className="afreact-tile-about">
          <TileAbout item={item} entity={entity} />
        </div>
      </div>
    </div>
  );
}

/** What a tile tells about its entry: a field's input, a block's fields, an element's use. */
function TileAbout({ item, entity }: { item: PaletteItem; entity: string | null }) {
  const { meta } = useEditor();
  if (item.field) {
    const { icon, kind, details } = fieldSummary(meta, item.field);
    return (
      <>
        <TileLine icon={icon}>{kind === item.title ? null : kind}</TileLine>
        {details.length > 0 && <p className="afreact-tile-detail">{details.join(" · ")}</p>}
      </>
    );
  }
  if (item.block) return <BlockAbout directive={item.block} entity={entity} />;
  const { icon, text } = elementSummary(item.element ?? "", item.node);
  return <TileLine icon={icon}>{text}</TileLine>;
}

function TileLine({
  icon,
  className,
  children,
}: {
  icon: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p className={className}>
      <i className={`crm-i ${icon}`} role="img" aria-hidden="true" /> {children}
    </p>
  );
}

/** A block's fields, its layout loaded once the tile is on show; `entity` is the palette's. */
function BlockAbout({ directive, entity }: { directive: string; entity: string | null }) {
  const editor = useEditor();
  const block = editor.meta.blocks[directive];
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const element = box.current;
    if (!element || seen) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [seen]);
  if (!block) throw new Error(`No block ${directive} in the editor's metadata.`);
  const scope = dropScope(editor.meta, block, entity);
  return (
    <div ref={box}>
      <TileLine
        icon={blockIcon(editor.meta, block, knownEntityType(editor, scope))}
        className="afreact-tile-detail"
      >
        {seen && <BlockFields directive={directive} scope={scope} />}
      </TileLine>
    </div>
  );
}

/** The scope a block dropped from a palette of `entity` (a form entity or a search) gets. */
function dropScope(meta: EditorMeta, block: BlockMeta, entity: string | null): ContainerScope {
  const search = !!entity && entity in meta.searchDisplays;
  return {
    path: [],
    entityName: search ? null : entity,
    dataEntity: entity ?? "",
    inFieldset: true,
    inBlock: true,
    join: block.join_entity ?? null,
    label: block.title,
    axis: "y",
  };
}

function BlockFields({ directive, scope }: { directive: string; scope: ContainerScope }) {
  const editor = useEditor();
  const { meta } = editor;
  const { loading, error } = useBlockLayout(directive);
  const block = meta.blocks[directive];
  if (error) return <span className="crm-error">{error}</span>;
  if (loading || !block) return ts("Loading…");
  // The fields' entity as the canvas finds it once the block is dropped there.
  const contents = blockContents(
    meta,
    block,
    (name) => block.join_entity ?? knownEntityType(editor, scope, name),
  );
  return contents.length ? contents.join(", ") : ts("Empty");
}

/** A labelled list of palette entries; nothing where it is empty. */
export function PaletteList({
  label,
  items,
  entity,
  inUse,
}: {
  label: string;
  items: PaletteItem[];
  /** The data-entity the entries may be dropped into; null for anywhere. */
  entity: string | null;
  inUse?: (item: PaletteItem) => boolean;
}) {
  if (!items.length) return null;
  return (
    <div role="group" aria-label={label}>
      <span className="afreact-palette-label">{label}</span>
      {/* core's afGuiEditor.css indents and highlights the entries under [ui-sortable] */}
      {/* deviation:palette-tiles */}
      <div ui-sortable="" className="afreact-palette-tiles">
        {items.map((item) => (
          <PaletteEntry
            key={item.key}
            item={item}
            entity={entity}
            disabled={inUse?.(item) ?? false}
          />
        ))}
      </div>
    </div>
  );
}

/** The palette's search box beside its legend. */
export function PaletteSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      className="form-control"
      type="search"
      placeholder="&#x1f50d;"
      title={ts("Search fields")}
      aria-label={ts("Search fields")}
    />
  );
}

/** Shut until opened: the options, which tell their settings in their heading. */
const SHUT_AT_FIRST: ReadonlySet<string> = new Set(["entity-options", "search-options"]);

/** What a palette keeps across its tabs: the sections a user shut, each tab's search term. */
interface PaletteMemory {
  closed: ReadonlySet<string>;
  remember: (name: string, open: boolean) => void;
  searches: Readonly<Record<string, string>>;
  search: (tab: string, term: string) => void;
}

export const PaletteMemoryContext = createContext<PaletteMemory | null>(null);

/** A palette's memory, for its PaletteMemoryContext. */
export function usePaletteMemory(): PaletteMemory {
  const [closed, setClosed] = useState(SHUT_AT_FIRST);
  const [searches, setSearches] = useState<Readonly<Record<string, string>>>({});
  return useMemo(
    () => ({
      closed,
      remember: (name: string, open: boolean) => {
        setClosed((before) => {
          const next = new Set(before);
          if (open) next.delete(name);
          else next.add(name);
          return next;
        });
      },
      searches,
      search: (tab: string, term: string) => {
        setSearches((before) => ({ ...before, [tab]: term }));
      },
    }),
    [closed, searches],
  );
}

/** The search term of a tab's add list, which the palette keeps while another tab is open. */
export function usePaletteSearch(tab: string): [string, (term: string) => void] {
  const shared = useContext(PaletteMemoryContext);
  // A tab drawn outside a palette keeps its term itself.
  const [own, setOwn] = useState("");
  if (!shared) return [own, setOwn];
  return [
    shared.searches[tab] ?? "",
    (term) => {
      shared.search(tab, term);
    },
  ];
}

/** What a shut section tells of: a missing or invalid value, or an error. */
const FLAWS = ":invalid, .has-error, [role=alert]:not(:empty)";

/**
 * A palette section under a heading that shows and hides it; `summary` tells what it holds while
 * shut, `note` stays in view even then.
 */
export function PaletteSection({
  name,
  title,
  summary,
  note,
  className,
  children,
}: {
  /** Keys the shut state across the tabs of one kind: "entity-values", "search-options"… */
  name: string;
  title: string;
  summary?: string;
  note?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const shared = useContext(PaletteMemoryContext);
  // A tab drawn outside a palette keeps its sections' state itself.
  const [own, setOwn] = useState(!SHUT_AT_FIRST.has(name));
  const open = shared ? !shared.closed.has(name) : own;
  const body = useRef<HTMLDivElement>(null);
  // A shut section tells of a missing or invalid value or an error it hides.
  const [flawed, setFlawed] = useState(false);
  useLayoutEffect(() => {
    const found = !open && !!body.current?.querySelector(FLAWS);
    if (found !== flawed) setFlawed(found);
  });
  // A child updating on its own, e.g. on a failed query, changes only the DOM.
  useEffect(() => {
    const element = body.current;
    if (open || !element) return undefined;
    const check = () => {
      setFlawed(!!element.querySelector(FLAWS));
    };
    const observer = new MutationObserver(check);
    observer.observe(element, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    check();
    return () => {
      observer.disconnect();
    };
  }, [open]);
  const about = flawed ? (
    <span className="crm-error">
      <i className="crm-i fa-exclamation-triangle" role="img" aria-hidden="true" />{" "}
      {ts("A value is missing or invalid")}
    </span>
  ) : (
    summary
  );
  // deviation:palette-sections
  return (
    <section className={`afreact-palette-section ${className ?? ""}`}>
      <h2 className="afreact-section-head">
        <button
          type="button"
          id={`${id}-head`}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          aria-describedby={about ? `${id}-summary` : undefined}
          onClick={() => {
            if (shared) shared.remember(name, !open);
            else setOwn(!open);
          }}
        >
          <i
            className={`crm-i fa-chevron-${open ? "down" : "right"}`}
            role="img"
            aria-hidden="true"
          />{" "}
          {title}
        </button>
        {about && (
          <span id={`${id}-summary`} className="afreact-section-summary">
            {about}
          </span>
        )}
      </h2>
      {note}
      <div ref={body} id={`${id}-body`} className="afreact-section-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

/** A tab panel's head: the part's icon and name, renamed in place where `onRename` is given. */
export function PanelHead({
  icon,
  label,
  renameLabel,
  onRename,
  children,
}: {
  icon: string;
  label: string;
  renameLabel?: string;
  onRename?: (label: string) => void;
  /** Buttons at the head's end. */
  children?: ReactNode;
}) {
  // deviation:entity-label-in-panel-head
  return (
    <div className="afreact-panel-head">
      <i className={`crm-i ${icon}`} role="img" aria-hidden="true" />
      {onRename ? (
        <InlineEdit
          className="afreact-panel-name"
          label={renameLabel ?? label}
          value={label}
          onChange={onRename}
        />
      ) : (
        <span className="afreact-panel-name">{label}</span>
      )}
      {children}
    </div>
  );
}

/** The palette's add list: a section whose search box sticks to the panel's top, then the lists. */
export function PaletteAdd({
  name,
  title,
  search,
  onSearch,
  children,
}: {
  name: string;
  title: string;
  search: string;
  onSearch: (value: string) => void;
  children: ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [none, setNone] = useState(false);
  // A list without entries renders nothing.
  useLayoutEffect(() => {
    const found = !!search && !list.current?.childElementCount;
    if (found !== none) setNone(found);
  });
  return (
    <PaletteSection name={name} title={title} className="af-gui-entity-palette">
      <div className="afreact-palette-search">
        <PaletteSearch value={search} onChange={onSearch} />
      </div>
      <div ref={list} className="af-gui-entity-palette-select-list">
        {children}
      </div>
      {/* deviation:palette-search-none */}
      <p role="status" className="help-block afreact-palette-none">
        {none ? ts("Nothing matches %1.", { 1: `“${search}”` }) : ""}
      </p>
    </PaletteSection>
  );
}

/**
 * Core's debounceMode: typing is kept locally and committed after two idle seconds or on blur;
 * otherwise the input shows the value, so undo and redo reach it.
 */
export function useDebounced(value: string, commit: (value: string) => void) {
  const [draft, setDraft] = useState<{ text: string; pending: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<string | null>(null);
  const latest = useRef(commit);
  useEffect(() => {
    latest.current = commit;
  });
  // An input that goes away, as when another tab opens, keeps what was typed into it.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (pending.current !== null) latest.current(pending.current);
    },
    [],
  );
  const flush = (text: string) => {
    window.clearTimeout(timer.current);
    pending.current = null;
    setDraft(null);
    latest.current(text);
  };
  return {
    value: draft?.text ?? value,
    onChange: (text: string) => {
      setDraft({ text, pending: true });
      pending.current = text;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        flush(text);
      }, 2000);
    },
    /** Commits the typing, or `replace` in its place; shows the value again. */
    onBlur: (replace?: string) => {
      if (draft?.pending) flush(replace ?? draft.text);
      else setDraft(null);
    },
    /** Shows `text` without committing it. */
    show: (text: string) => {
      setDraft({ text, pending: false });
    },
  };
}

/** A text input in core's debounceMode. */
export function DebouncedInput({
  value,
  onCommit,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur"> & {
  value: string;
  onCommit: (value: string) => void;
}) {
  const field = useDebounced(value, onCommit);
  return (
    <input
      {...props}
      value={field.value}
      onChange={(event) => {
        field.onChange(event.target.value);
      }}
      onBlur={() => {
        field.onBlur();
      }}
    />
  );
}

/** A textarea in core's debounceMode. */
export function DebouncedTextarea({
  value,
  onCommit,
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "onBlur"> & {
  value: string;
  onCommit: (value: string) => void;
}) {
  const field = useDebounced(value, onCommit);
  return (
    <textarea
      {...props}
      value={field.value}
      onChange={(event) => {
        field.onChange(event.target.value);
      }}
      onBlur={() => {
        field.onBlur();
      }}
    />
  );
}

/** crm-ui-help's link, whose "?" the theme's `helpicon` draws, opening the FormBuilder's help. */
export function HelpLink({ id, title }: { id: string; title: string }) {
  return (
    <a
      href="#"
      className="helpicon"
      title={ts("%1 Help", { 1: title })}
      aria-label={ts("%1 Help", { 1: title })}
      onClick={(event) => {
        event.preventDefault();
        window.CRM.help?.(title, { id, file: "CRM/AfformAdmin/afformBuilder" });
      }}
    />
  );
}
