import { useEffect, useEffectEvent, useId, useState, type CSSProperties } from "react";
import { api4, errorMessage } from "../../../api/civi";
import { NgElement } from "../../widgets/NgElement";
import { Dialog } from "../../widgets/Dialog";
import { Dropdown } from "../../widgets/Dropdown";
import { IconDialog } from "../../widgets/IconPicker";
import { InlineEdit } from "../../widgets/InlineEdit";
import { useEditor, type EditorApi } from "../context";
import { saveAfform } from "../save";
import { nodeDefn } from "../fields";
import { encodeLiteral, isLiteralObject, type Literal } from "../literal";
import { getField, type AdminData, type AfformDefinition, type BlockMeta } from "../meta";
import { filled, jsAttribute, textAttribute } from "../model";
import {
  blockOf,
  getStyles,
  layoutOf,
  nodeType,
  originalBlock,
  overrideBlock,
  searchKey,
  shownChildren,
  withLayout,
  withoutAttributes,
  type LayoutClass,
  type NodeType,
} from "../nodes";
import {
  isElement,
  ORIGINAL_BLOCK,
  withoutMarks,
  type NodePath,
  type ShallowElement,
  type ShallowNode,
} from "../tree";
import {
  BackgroundMenuItem,
  BorderMenuItem,
  CollapsibleMenuItem,
  ConditionalItem,
  DeleteAction,
  ElementBar,
  GearMenu,
  MenuAction,
  MenuControls,
  MenuDivider,
  ScopeContext,
  StyleMenuItem,
  useNodeOps,
  useRenderElement,
  type ElementProps,
  type NodeOps,
} from "./common";
import { useCanvasBody, useCanvasItem } from "./dnd";
import type { ContainerScope } from "./dropRules";
import { childScope, knownEntityType } from "./scope";
import { MenuLink } from "../../widgets/MenuLink";

/** The node's style attribute for React, as core's `style="{{ item.style }}"`. */
export function styleOf(node: ShallowElement): CSSProperties {
  return Object.fromEntries(
    Object.entries(getStyles(node)).map(([name, value]) => [
      name.startsWith("--")
        ? name
        : name.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase()),
      value,
    ]),
  );
}

/** afGui.pickIcon(): the icon dialog, opened beside the menu or bar that asked for it. */
export function pickIcon(editor: EditorApi, label: string, onPick: (icon: string) => void) {
  editor.openDialog((close) => (
    <IconDialog
      label={label}
      transform=""
      required={false}
      onPick={(icon) => {
        close();
        onPick(icon);
      }}
      onCancel={close}
    />
  ));
}

const containerTags = (): Record<string, string> => ({
  div: ts("Container"),
  fieldset: ts("Fieldset"),
  details: ts("Collapsible"),
});

/** A short name for the element, for the drag announcements and the move handle. */
function elementLabel(
  editor: EditorApi,
  scope: ContainerScope,
  node: ShallowElement,
  type: NodeType,
): string {
  const text = (child: ShallowNode | undefined) =>
    child && !isElement(child) && "#text" in child ? child["#text"].trim() : "";
  switch (type) {
    case "field": {
      const name = textAttribute(node, "name") ?? "";
      const own = nodeDefn(node).label;
      if (typeof own === "string" && own) return own;
      const entity = knownEntityType(editor, scope, name);
      return (entity && getField(editor.meta, entity, name)?.label) ?? name;
    }
    case "fieldset": {
      const name = textAttribute(node, "af-fieldset") ?? "";
      return editor.entities.find((entity) => entity.name === name)?.label ?? name;
    }
    case "searchFieldset":
      return ts("Search Display");
    case "join":
      return textAttribute(node, "af-join") ?? "";
    case "container":
      return textAttribute(node, "af-title") ?? containerTags()[node["#tag"]] ?? ts("Block");
    case "text":
    case "button":
      return text(node["#children"]?.[0]) || node["#tag"];
    case "markup":
      return ts("Rich content");
    case "tabset":
      return textAttribute(node, "page-nav-buttons") ? ts("Pages") : ts("Tab Set");
    case "searchDisplay":
      return textAttribute(node, "display-name") ?? textAttribute(node, "search-name") ?? "";
    default:
      return (
        Object.values(editor.meta.gui.elements).find((each) => each.directive === node["#tag"])
          ?.title ?? node["#tag"]
      );
  }
}

/** The element at `path` as its type shows it, in a wrapper that drags and takes drops. */
function CanvasElement({
  path,
  node,
  scope,
  type,
  shown,
}: {
  path: NodePath;
  node: ShallowElement;
  scope: ContainerScope;
  type: NodeType;
  /** The indexes of the siblings the canvas draws. */
  shown: number[];
}) {
  const editor = useEditor();
  const render = useRenderElement();
  const label = elementLabel(editor, scope, node, type);
  const item = useCanvasItem(path, node, scope, label, shown);
  const classes = [item.dropClass, item.dragClass].filter(Boolean);
  return (
    <div ref={item.ref} className={classes.join(" ") || undefined}>
      {render(type, { path, node, scope, handle: item.handle, label })}
    </div>
  );
}

/** A container's children in its layout: a drop on the free space puts an element last. */
export function CanvasBody({
  scope,
  nodes,
  layout,
  onDropClass,
}: {
  scope: ContainerScope;
  nodes: ShallowNode[];
  layout: LayoutClass;
  /** The container's highlight while something is dragged over its free space. */
  onDropClass?: (dropClass: string) => void;
}) {
  const editor = useEditor();
  const types = nodes.map((child) => (isElement(child) ? nodeType(child, editor.meta) : null));
  const shown = types.flatMap((type, index) => (type ? [index] : []));
  const body = useCanvasBody(scope, nodes.length, shown);
  useEffect(() => {
    onDropClass?.(body.dropClass);
  }, [onDropClass, body.dropClass]);
  return (
    <ScopeContext value={scope}>
      <div ref={body.ref} ui-sortable="" className={`af-gui-layout ${layout}`}>
        {nodes.map((child, index) => {
          const type = types[index];
          // Core's wrapper stays for what the canvas does not show, such as af-entity.
          if (!type || !isElement(child)) return <div key={index} />;
          return (
            <CanvasElement
              key={index}
              path={[...scope.path, index]}
              node={child}
              scope={scope}
              type={type}
              shown={shown}
            />
          );
        })}
      </div>
    </ScopeContext>
  );
}

const inFlight = new Map<string, Promise<AdminData>>();

/** Afform.loadAdminData for a block's layout, the entities whose fields are known skipped. */
function loadBlock(editor: EditorApi, name: string): Promise<AdminData> {
  let pending = inFlight.get(name);
  if (!pending) {
    const skipEntities = Object.entries(editor.meta.gui.entities)
      .filter(([, entity]) => entity.fields)
      .map(([entityName]) => entityName);
    // For a block deleted since the editor opened, core returns no definition, or only its locale.
    pending = api4<
      Omit<AdminData, "definition"> & { definition: AfformDefinition | { locale: string[] } | null }
    >("Afform", "loadAdminData", { definition: { name }, skipEntities })
      .then(([data]) => {
        if (!data) throw new Error(`Afform.loadAdminData returned nothing for ${name}.`);
        const { definition } = data;
        if (!definition || !("layout" in definition))
          throw new Error(ts("There is no block named %1.", { 1: name }));
        return { ...data, definition };
      })
      .finally(() => {
        inFlight.delete(name);
      });
    inFlight.set(name, pending);
  }
  return pending;
}

/** The block's layout, loaded where the editor does not know it yet. */
export function useBlockLayout(directive: string | null): {
  loading: boolean;
  error: string | null;
} {
  const editor = useEditor();
  const block = directive ? editor.meta.blocks[directive] : undefined;
  const missing = !!directive && !block?.layout;
  const [error, setError] = useState<string | null>(null);
  const name = missing ? block?.name : undefined;
  const load = useEffectEvent((blockName: string) => loadBlock(editor, blockName));
  const loaded = useEffectEvent((data: AdminData) => {
    editor.addMeta(data);
  });
  // Loads once per block; a failure stays shown rather than retried on every editor change.
  useEffect(() => {
    if (!name) return undefined;
    let live = true;
    setError(null);
    load(name).then(
      (data) => {
        if (live) loaded(data);
      },
      (failure: unknown) => {
        if (live) setError(errorMessage(failure));
      },
    );
    return () => {
      live = false;
    };
  }, [name]);
  return { loading: missing && !error, error: missing ? error : null };
}

const isRecord = (value: Literal | undefined): value is Record<string, Literal> =>
  isLiteralObject(value);

/** A JS object attribute such as `data` or `actions`; {} where it is absent. */
function objectAttribute(node: ShallowElement, name: string): Record<string, Literal> {
  const value = jsAttribute(node, name);
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error(`The ${name} of ${node["#tag"]} is not an object.`);
  return value;
}

/** The node with `name` set to the object, or removed where it is empty. */
function withObject(
  node: ShallowElement,
  name: string,
  value: Record<string, Literal>,
): ShallowElement {
  return Object.keys(value).length
    ? { ...node, [name]: encodeLiteral(value) }
    : withoutAttributes(node, [name]);
}

/** toggleRepeat(): repeat on with core's defaults, or off with its settings gone. */
export function toggleRepeat(node: ShallowElement): ShallowElement {
  if ("af-repeat" in node)
    return withoutAttributes(node, ["max", "min", "af-repeat", "add-icon", "af-copy", "copy-icon"]);
  return {
    ...withoutAttributes(node, ["data"]),
    min: "1",
    "af-repeat": ts("Add"),
    "af-copy": ts("Copy"),
  };
}

const intOf = (text: string | undefined) => (text ? parseInt(text, 10) : null);

/** getSetMin(): the minimum, raising the maximum to it. */
export function withMin(node: ShallowElement, min: number | null): ShallowElement {
  let next = node;
  const max = intOf(textAttribute(node, "max"));
  if (max !== null && min !== null && min > max) next = { ...next, max: String(min) };
  return min ? { ...next, min: String(min) } : withoutAttributes(next, ["min"]);
}

/** getSetMax(): the maximum, lowering the minimum to it. */
export function withMax(node: ShallowElement, max: number | null): ShallowElement {
  let next = node;
  const min = intOf(textAttribute(node, "min"));
  if (min !== null && max && max < min) next = { ...next, min: String(max) };
  return max === null ? withoutAttributes(next, ["max"]) : { ...next, max: String(max) };
}

const numberOf = (text: string): number | null => {
  const value = parseInt(text, 10);
  return Number.isNaN(value) ? null : value;
};

/** removeField(): the field elements named gone from the container, a block shown copied in. */
function withoutField(node: ShallowElement, editor: EditorApi, fieldName: string): ShallowElement {
  const prune = (nodes: ShallowNode[]): ShallowNode[] =>
    nodes
      .filter(
        (child) => !(isElement(child) && child["#tag"] === "af-field" && child.name === fieldName),
      )
      .map((child) =>
        isElement(child) && child["#children"]
          ? { ...child, "#children": prune(child["#children"]) }
          : child,
      );
  const shown = shownChildren(node, editor.meta);
  const pruned = prune(shown);
  if (JSON.stringify(pruned) === JSON.stringify(shown)) return node;
  return { ...overrideBlock(node, editor.meta), "#children": pruned };
}

const optionKey = (id: unknown): string | number | boolean => {
  if (typeof id === "string" || typeof id === "number" || typeof id === "boolean") return id;
  throw new Error(`Option id ${JSON.stringify(id)} is no scalar.`);
};

interface ToggleItem {
  field: string | null;
  /** An option's id, true for a yes/no field, or "repeat". */
  key: string | number | boolean;
  label: string;
}

/** afGuiContainerMultiToggle: one repeating block, or one block per value of a unique field. */
export function MultiToggle({ ops, entityType }: { ops: NodeOps; entityType: string }) {
  const editor = useEditor();
  const entity = editor.meta.gui.entities[entityType];
  const unique = Object.values(entity?.unique_fields ?? {});
  const fields = new Map(
    unique.map((name) => {
      const field = getField(editor.meta, entityType, name);
      if (!field) throw new Error(`No field ${name} on ${entityType}.`);
      return [name, field];
    }),
  );
  const groups: ToggleItem[][] = [
    [{ field: null, key: "repeat", label: ts("Multiple") }],
    ...[...fields].map(([name, field]) =>
      Array.isArray(field.options)
        ? field.options.map((option) => ({
            field: name,
            key: optionKey(option.id),
            label: option.label,
          }))
        : [{ field: name, key: true as const, label: field.label ?? name }],
    ),
  ];
  const multi = "af-repeat" in ops.node;
  const data = objectAttribute(ops.node, "data");
  const selected = (item: ToggleItem) => {
    if (item.field === null) return multi;
    const value = data[item.field];
    return Array.isArray(fields.get(item.field)?.options) ? value === item.key : !!value;
  };
  // deviation:block-toggle-first-value
  // Core's loop cannot stop early and so names the last match; the first is named here.
  const current = (() => {
    if (multi) return ts("Multiple");
    for (const [name, value] of Object.entries(data)) {
      const field = fields.get(name);
      if (!value || !field) continue;
      if (!Array.isArray(field.options)) return field.label ?? name;
      const option = field.options.find((each) => each.id === value);
      if (option) return option.label;
    }
    return ts("Single");
  })();
  const choose = (item: ToggleItem) => {
    const field = item.field;
    if (field === null) {
      ops.edit(toggleRepeat);
      return;
    }
    ops.edit((node) => {
      let next = "af-repeat" in node ? toggleRepeat(node) : node;
      const values = objectAttribute(next, "data");
      let removeField = false;
      if (values[field] === item.key || (item.key === true && values[field])) {
        delete values[field];
        next = withObject(next, "data", values);
      } else {
        next = withObject(next, "data", { [field]: item.key });
        removeField = true;
      }
      return removeField ? withoutField(next, editor, field) : next;
    });
  };
  // Riverlea lays out the button by core's element name and Angular's binding class.
  return (
    <NgElement tag="af-gui-container-multi-toggle">
      <Dropdown
        groupClass="btn-group"
        buttonClass="btn btn-default btn-xs dropdown-toggle"
        title={ts("Toggle multi or single block")}
        alignRight
        label={
          <span className="ng-binding">
            <i
              className={`crm-i fa-${multi ? "repeat" : "dot-circle-o"}`}
              role="img"
              aria-hidden="true"
            />{" "}
            {current}
          </span>
        }
      >
        {(close) =>
          groups.map((items, group) => (
            <MultiToggleGroup
              key={group}
              divider={group > 0}
              items={items}
              selected={selected}
              onChoose={(item) => {
                choose(item);
                close();
              }}
            />
          ))
        }
      </Dropdown>
    </NgElement>
  );
}

function MultiToggleGroup({
  divider,
  items,
  selected,
  onChoose,
}: {
  divider: boolean;
  items: ToggleItem[];
  selected: (item: ToggleItem) => boolean;
  onChoose: (item: ToggleItem) => void;
}) {
  return (
    <>
      {divider && <MenuDivider />}
      {items.map((item) => (
        <li key={`${item.field ?? ""}:${String(item.key)}`}>
          <MenuLink
            pressed={selected(item)}
            onClick={() => {
              onChoose(item);
            }}
          >
            <i
              className={`crm-i fa-${selected(item) ? "check-" : ""}circle-o`}
              role="img"
              aria-hidden="true"
            />{" "}
            {item.label}
          </MenuLink>
        </li>
      ))}
    </>
  );
}

/** saveBlock.html: the container's contents saved as a block, new or over the one it came from. */
function SaveBlockDialog({
  initial,
  original,
  onSaved,
  onClose,
}: {
  initial: Record<string, unknown>;
  original: BlockMeta | null;
  onSaved: (block: BlockMeta) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(original?.title ?? "");
  const [update, setUpdate] = useState(!!original);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choose = (next: boolean) => {
    setUpdate(next);
    // Core's watcher: a copy is named as one until its title is changed.
    if (!original) return;
    if (!next && title === original.title) setTitle(`${original.title} ${ts("(copy)")}`);
    else if (next) setTitle(original.title);
  };
  const { saveBlocked } = useEditor();
  const save = () => {
    // Blocks are saved past the form's save, so the same guard applies here.
    if (saveBlocked) {
      setError(saveBlocked);
      return;
    }
    setSaving(true);
    setError(null);
    const record = { ...initial, title, name: update && original ? original.name : null };
    saveAfform<BlockMeta>(record).then(onSaved, (failure: unknown) => {
      setError(errorMessage(failure));
      setSaving(false);
    });
  };
  return (
    <Dialog
      title={ts("Save block")}
      onClose={onClose}
      buttons={
        <button
          type="button"
          className="btn btn-primary"
          disabled={!title || saving}
          onClick={() => {
            save();
          }}
        >
          {ts("Save")}
        </button>
      }
    >
      <div className="alert alert-info">
        {ts("Saving a container as a block allows it to be reused across forms.")}
      </div>
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      <div>
        <label htmlFor={`${id}-title`}>
          {ts("Title:")} <span className="crm-marker">*</span>
        </label>
        <input
          id={`${id}-title`}
          className="form-control"
          required
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
      </div>
      {original && (
        <fieldset className="form-inline">
          <legend className="sr-only">{ts("Save as")}</legend>
          <label>
            <input
              type="radio"
              name={`${id}-save-as`}
              checked={update}
              onChange={() => {
                choose(true);
              }}
            />{" "}
            {ts("Update %1", { 1: original.title })}
          </label>{" "}
          <label>
            <input
              type="radio"
              name={`${id}-save-as`}
              checked={!update}
              onChange={() => {
                choose(false);
              }}
            />{" "}
            {ts("Save New Block")}
          </label>
        </fieldset>
      )}
      {update && original && (
        <div className="alert alert-warning">
          {ts("Affects every form that uses this block, system-wide.")}
        </div>
      )}
    </Dialog>
  );
}

/** setBlockDirective(): the join shows the block, or the container becomes the block's tag. */
function withBlock(node: ShallowElement, directive: string): ShallowElement {
  if (textAttribute(node, "af-join"))
    return { ...withoutAttributes(node, [ORIGINAL_BLOCK]), "#children": [{ "#tag": directive }] };
  return { ...withoutAttributes(node, ["#children", "class", ORIGINAL_BLOCK]), "#tag": directive };
}

/** The editable label and icon of a repeat or copy button. */
function RepeatButton({
  ops,
  textKey,
  iconKey,
  icon,
  label,
}: {
  ops: NodeOps;
  textKey: string;
  iconKey: string;
  icon: string;
  label: string;
}) {
  const editor = useEditor();
  return (
    <div className="af-gui-button">
      <span className="btn btn-xs btn-primary disabled">
        <button
          type="button"
          className="btn btn-link btn-xs crm-editable-enabled afreact-icon-button"
          title={ts("Choose icon")}
          aria-label={ts("Choose icon for %1", { 1: label })}
          onClick={() => {
            pickIcon(editor, ts("Choose icon"), (picked) => {
              ops.edit((node) => ({ ...node, [iconKey]: picked }));
            });
          }}
        >
          <i
            className={`crm-i ${filled(textAttribute(ops.node, iconKey)) ?? icon}`}
            role="img"
            aria-hidden="true"
          />
        </button>{" "}
        <InlineEdit
          label={label}
          value={textAttribute(ops.node, textKey) ?? ""}
          onChange={(value) => {
            ops.edit((node) => ({ ...node, [textKey]: value }));
          }}
        />
      </span>
    </div>
  );
}

/** The repeat entries: on or off, the range, and how many show at first. */
function RepeatMenuItems({ ops, repeatMax }: { ops: NodeOps; repeatMax: number | null }) {
  const id = useId();
  const repeating = "af-repeat" in ops.node;
  const shown = textAttribute(ops.node, "af-repeat-default") ?? "";
  return (
    <>
      <MenuControls>
        <label>
          <input
            type="checkbox"
            checked={repeating}
            onChange={() => {
              ops.edit(toggleRepeat);
            }}
          />{" "}
          {ts("Repeat")}
        </label>
        <span style={{ visibility: repeating ? "visible" : "hidden" }}>
          {" "}
          <input
            type="number"
            className="form-control"
            aria-label={ts("Minimum")}
            placeholder="0"
            min="0"
            step="1"
            disabled={!repeating}
            value={textAttribute(ops.node, "min") ?? ""}
            onChange={(event) => {
              const value = numberOf(event.target.value);
              ops.edit((node) => withMin(node, value));
            }}
          />{" "}
          -{" "}
          <input
            type="number"
            className="form-control"
            aria-label={ts("Maximum")}
            placeholder={ts("max")}
            min="2"
            max={repeatMax ?? undefined}
            step="1"
            disabled={!repeating}
            value={textAttribute(ops.node, "max") ?? ""}
            onChange={(event) => {
              const value = numberOf(event.target.value);
              ops.edit((node) => withMax(node, value));
            }}
          />
        </span>
      </MenuControls>
      {repeating && (
        <MenuControls>
          <label htmlFor={id} className="pull-right">
            {ts("Initially show:")}{" "}
            <input
              id={id}
              type="number"
              className="form-control"
              placeholder={filled(textAttribute(ops.node, "min")) ?? "1"}
              min="0"
              step="1"
              value={shown}
              onChange={(event) => {
                const value = numberOf(event.target.value);
                ops.edit((node) =>
                  value === null
                    ? withoutAttributes(node, ["af-repeat-default"])
                    : { ...node, "af-repeat-default": String(value) },
                );
              }}
            />
          </label>
        </MenuControls>
      )}
    </>
  );
}

/** The join's allowed actions: update, and delete only with update. */
function JoinActionsMenuItem({ ops }: { ops: NodeOps }) {
  const actions = objectAttribute(ops.node, "actions");
  const set = (key: "update" | "delete", value: boolean) => {
    ops.edit((node) => {
      const next = { ...objectAttribute(node, "actions"), [key]: value };
      if (key === "update" && !value) next.delete = false;
      return withObject(node, "actions", next);
    });
  };
  return (
    <MenuControls>
      <fieldset className="form-group">
        <legend className="afreact-inline-legend">{ts("Allow:")}</legend>
        <div className="checkbox-inline">
          <label>
            <input
              type="checkbox"
              checked={actions.update === true}
              onChange={(event) => {
                set("update", event.target.checked);
              }}
            />
            {ts("Update")}
          </label>
        </div>
        <div className="checkbox-inline">
          <label>
            <input
              type="checkbox"
              checked={actions.delete === true}
              disabled={actions.update !== true}
              onChange={(event) => {
                set("delete", event.target.checked);
              }}
            />
            {ts("Delete")}
          </label>
        </div>
      </fieldset>
    </MenuControls>
  );
}

function TagMenuItem({ ops }: { ops: NodeOps }) {
  const id = useId();
  const tags = containerTags();
  if (!(ops.node["#tag"] in tags)) return null;
  return (
    <MenuControls>
      <label htmlFor={id}>{ts("Element:")}</label>{" "}
      <select
        id={id}
        className="form-control"
        title={ts("Container type")}
        value={ops.node["#tag"]}
        onChange={(event) => {
          const tag = event.target.value;
          ops.edit((node) => ({ ...node, "#tag": tag }));
        }}
      >
        {Object.entries(tags).map(([tag, label]) => (
          <option key={tag} value={tag}>
            {label}
          </option>
        ))}
      </select>
    </MenuControls>
  );
}

function LayoutMenuItem({ ops }: { ops: NodeOps }) {
  const id = useId();
  const current = layoutOf(ops.node);
  const layouts: [LayoutClass, string][] = [
    ["af-layout-rows", ts("Contents display as rows")],
    ["af-layout-cols", ts("Contents are evenly-spaced columns")],
    ["af-layout-inline", ts("Contents are arranged inline")],
  ];
  return (
    <MenuControls>
      <span id={id}>{ts("Layout:")}</span>{" "}
      <div className="btn-group btn-group-sm" role="group" aria-labelledby={id}>
        {layouts.map(([layout, label]) => (
          <LayoutButton
            key={layout}
            layout={layout}
            label={label}
            active={layout === current}
            onClick={() => {
              ops.edit((node) => withLayout(node, layout));
            }}
          />
        ))}
      </div>
    </MenuControls>
  );
}

function LayoutButton({
  layout,
  label,
  active,
  onClick,
}: {
  layout: LayoutClass;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? "btn btn-default active" : "btn btn-default"}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
    >
      <i className={`af-gui-layout-icon ${layout}`} role="img" aria-hidden="true" />
    </button>
  );
}

type ContainerType = Extract<NodeType, "fieldset" | "container" | "join" | "searchFieldset">;

/** afGuiContainer: a container, fieldset, join or block, with its bar, title and contents. */
export function Container({ type, ...props }: ElementProps & { type: ContainerType }) {
  const { path, node, scope: parent, handle, label } = props;
  const editor = useEditor();
  const { meta } = editor;
  const ops = useNodeOps(path, node);
  const [dropClass, setDropClass] = useState("");
  const directive = blockOf(node, meta);
  const original = originalBlock(node, meta);
  const join = textAttribute(node, "af-join") ?? null;
  const isBlock = !!join || node["#tag"] in meta.blocks || original !== null;
  const scope = { ...childScope(editor, parent, path, node, label), inBlock: isBlock };
  const { loading, error } = useBlockLayout(directive);
  const searchFieldsetKey = type === "searchFieldset" ? (searchKey(node, meta) ?? "") : null;
  const selectName = searchFieldsetKey ?? textAttribute(node, "af-fieldset") ?? null;
  const entityType = knownEntityType(editor, scope) ?? null;
  const joinEntity = join ? meta.gui.entities[join] : undefined;
  const rawMax = joinEntity?.repeat_max;
  const repeatMax = typeof rawMax === "string" ? numberOf(rawMax) : (rawMax ?? null);
  const repeatable =
    (!!join && repeatMax !== 1) ||
    (!!directive && !!meta.blocks[directive]?.repeat) ||
    !!textAttribute(node, "af-fieldset");
  const blockOptions = Object.entries(meta.blocks).filter(
    ([tag, block]) =>
      tag === node["#tag"] || (!!block.join_entity && block.join_entity === entityType),
  );
  const canSaveAsBlock =
    !textAttribute(node, "af-fieldset") &&
    !isBlock &&
    !parent.inBlock &&
    (scope.entityName ?? "") === scope.dataEntity;
  const tags = containerTags();
  const tooltip = isBlock
    ? undefined
    : [
        type === "fieldset"
          ? editor.entities.find((entity) => entity.name === scope.entityName)?.label
          : type === "searchFieldset"
            ? ts("Search Display")
            : "",
        tags[node["#tag"]],
      ]
        .filter(Boolean)
        .join(" ");

  const openSaveBlock = () => {
    if (scope.entityName && entityType === null) {
      window.CRM.alert(
        ts("The form has no entity %1 to save this block for.", { 1: scope.entityName }),
        ts("Save block"),
        "error",
      );
      return;
    }
    const originalMeta = original ? (meta.blocks[original] ?? null) : null;
    const model: Record<string, unknown> = {
      title: "",
      name: null,
      type: "block",
      layout: withoutMarks(node["#children"] ?? []),
    };
    if (join) model.join_entity = join;
    // deviation:save-block-any-entity
    // Outside any entity, where core's builder throws, the block is for any entity.
    if (!originalMeta) model.entity_type = scope.entityName ? entityType : "*";
    editor.openDialog((close) => (
      <SaveBlockDialog
        initial={model}
        original={originalMeta}
        onClose={close}
        onSaved={(saved) => {
          close();
          editor.addMeta({ definition: { ...saved, type: "block", layout: saved.layout ?? [] } });
          ops.edit((current) => withBlock(current, saved.directive_name));
        }}
      />
    ));
  };

  const classes = [
    "af-gui-container",
    type === "fieldset" || type === "searchFieldset" ? "af-gui-fieldset" : "",
    type === "join" ? "" : `af-gui-container-type-${node["#tag"]}`,
    type === "join" ? "" : (textAttribute(node, "class") ?? ""),
    selectName !== null && selectName === editor.selected ? "af-entity-selected" : "",
    dropClass,
  ].filter(Boolean);
  const collapsedIcon =
    node["#tag"] === "details" ? ("open" in node ? "fa-caret-down" : "fa-caret-right") : "";
  const repeatText = textAttribute(node, "af-repeat");
  const copyText = textAttribute(node, "af-copy");

  return (
    <NgElement
      tag="af-gui-container"
      className={classes.join(" ")}
      style={styleOf(node)}
      data-entity={scope.dataEntity}
    >
      <ElementBar
        handle={handle}
        label={label}
        className={isBlock ? "af-gui-bar af-gui-block-bar" : "af-gui-bar"}
        onPress={() => {
          if (selectName) editor.select(selectName);
        }}
      >
        {loading ? (
          <div>
            <i className="crm-i fa-spin fa-spinner" role="img" aria-label={ts("Loading…")} />
          </div>
        ) : (
          <div className="form-inline" title={tooltip}>
            {isBlock && <span>{join ? `${ts(join)}:` : ts("Block:")}</span>}
            {isBlock && (
              <select
                aria-label={ts("Select block")}
                title={ts("Select block")}
                value={directive ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  ops.edit((current) =>
                    value ? withBlock(current, value) : overrideBlock(current, meta),
                  );
                }}
              >
                <option value="">{ts("Custom")}</option>
                {blockOptions.map(([tag, block]) => (
                  <option key={tag} value={tag}>
                    {block.title}
                  </option>
                ))}
              </select>
            )}
            {isBlock && !directive && (
              <>
                {" "}
                <button
                  type="button"
                  className="btn btn-default btn-xs"
                  title={ts("Save block")}
                  onClick={openSaveBlock}
                >
                  {ts("Save...")}
                </button>
              </>
            )}
            <div className="btn-group pull-right">
              {(!!join || !!textAttribute(node, "af-repeat")) && repeatable && entityType && (
                <MultiToggle ops={ops} entityType={entityType} />
              )}
              <GearMenu alignRight pullRight={false}>
                {() =>
                  searchFieldsetKey !== null ? (
                    <>
                      <TagMenuItem ops={ops} />
                      {node["#tag"] === "details" && <CollapsibleMenuItem ops={ops} />}
                      <StyleMenuItem ops={ops} />
                      <BorderMenuItem ops={ops} />
                      <BackgroundMenuItem ops={ops} />
                      <MenuDivider />
                      <DeleteAction ops={ops} label={ts("Remove display")} />
                    </>
                  ) : (
                    <>
                      {canSaveAsBlock && (
                        <>
                          <MenuAction onClick={openSaveBlock}>{ts("Save as block")}</MenuAction>
                          <MenuDivider />
                        </>
                      )}
                      <TagMenuItem ops={ops} />
                      {!isBlock && node["#tag"] === "details" && <CollapsibleMenuItem ops={ops} />}
                      {repeatable && <RepeatMenuItems ops={ops} repeatMax={repeatMax} />}
                      {!isBlock && <LayoutMenuItem ops={ops} />}
                      {join && <JoinActionsMenuItem ops={ops} />}
                      <StyleMenuItem ops={ops} />
                      <BorderMenuItem ops={ops} />
                      <BackgroundMenuItem ops={ops} />
                      <ConditionalItem ops={ops} />
                      <MenuDivider />
                      <DeleteAction
                        ops={ops}
                        label={isBlock ? ts("Remove block") : ts("Remove container")}
                      />
                    </>
                  )
                }
              </GearMenu>
            </div>
          </div>
        )}
      </ElementBar>
      {!isBlock && (
        <div
          className="af-gui-node-title af-gui-container-title af-gui-text-h3"
          title={ts("Container title")}
        >
          <i className={`crm-i ${collapsedIcon}`} role="img" aria-hidden="true" />{" "}
          <InlineEdit
            label={ts("Container title")}
            placeholder={ts("No title")}
            value={textAttribute(node, "af-title") ?? ""}
            onChange={(value) => {
              ops.edit((current) =>
                value
                  ? { ...current, "af-title": value }
                  : withoutAttributes(current, ["af-title"]),
              );
            }}
          />
        </div>
      )}
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      {!loading && !error && (
        <CanvasBody
          scope={scope}
          nodes={shownChildren(node, meta)}
          layout={layoutOf(node)}
          onDropClass={setDropClass}
        />
      )}
      {repeatText !== undefined && (
        <RepeatButton
          ops={ops}
          textKey="af-repeat"
          iconKey="add-icon"
          icon="fa-plus"
          label={ts("Add button text")}
        />
      )}
      {copyText !== undefined && (
        <RepeatButton
          ops={ops}
          textKey="af-copy"
          iconKey="copy-icon"
          icon="fa-copy"
          label={ts("Copy button text")}
        />
      )}
    </NgElement>
  );
}

/** The canvas itself: the form's or block's contents, without a bar or container frame. */
export function CanvasRoot({ scope, nodes }: { scope: ContainerScope; nodes: ShallowNode[] }) {
  const [dropClass, setDropClass] = useState("");
  return (
    <div className={dropClass || undefined} data-entity={scope.dataEntity}>
      <CanvasBody scope={scope} nodes={nodes} layout="af-layout-rows" onDropClass={setDropClass} />
    </div>
  );
}
