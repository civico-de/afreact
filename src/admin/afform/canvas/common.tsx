import { createContext, useContext, useId, type ReactNode } from "react";
import { Dropdown } from "../../widgets/Dropdown";
import { editNode, removeAt, useEditor } from "../context";
import { textAttribute } from "../model";
import {
  getStyles,
  modifyClasses,
  setStyle,
  splitClass,
  withoutAttributes,
  type NodeType,
} from "../nodes";
import type { NodePath, ShallowElement } from "../tree";
import type { ContainerScope } from "./dropRules";
import { ConditionalMenuItem } from "./Conditional";
import { MenuLink } from "../../widgets/MenuLink";

/** What an element on the canvas edits: its node, through the editor's history. */
export interface NodeOps {
  path: NodePath;
  node: ShallowElement;
  edit: (update: (node: ShallowElement) => ShallowElement) => void;
  remove: () => void;
}

export function useNodeOps(path: NodePath, node: ShallowElement): NodeOps {
  const editor = useEditor();
  return {
    path,
    node,
    edit: (update) => {
      editor.change((afform) => editNode(afform, editor.meta, path, update));
    },
    remove: () => {
      editor.change((afform) => removeAt(afform, editor.meta, path));
    },
  };
}

/** What every canvas element gets from the container it sits in. */
export interface ElementProps {
  path: NodePath;
  node: ShallowElement;
  /** The container the element sits in. */
  scope: ContainerScope;
  handle: DragHandleProps;
  label: string;
}

/** Shows an element of the given type; the editor provides it, so containers can hold any. */
export type RenderElement = (type: NodeType, props: ElementProps) => ReactNode;

export const RenderContext = createContext<RenderElement | null>(null);

export function useRenderElement(): RenderElement {
  const render = useContext(RenderContext);
  if (!render) throw new Error("Canvas elements need the editor's renderer around them.");
  return render;
}

/** The container an element sits in. */
export const ScopeContext = createContext<ContainerScope | null>(null);

export function useScope(): ContainerScope {
  const scope = useContext(ScopeContext);
  if (!scope) throw new Error("Canvas elements need their container around them.");
  return scope;
}

/** The handle a canvas element is moved with by keyboard; the bar around it takes the pointer. */
export interface DragHandleProps {
  ref: (element: HTMLElement | null) => void;
  onPointerDown?: (event: React.PointerEvent) => void;
  onKeyDown?: (event: React.KeyboardEvent) => void;
  [attribute: string]: unknown;
}

const BAR_CONTROLS =
  "input, textarea, button, select, option, a, .dropdown-menu, [contenteditable]";

/** af-gui-bar: the element's bar, which drags it, with its own controls. */
export function ElementBar({
  handle,
  label,
  className = "af-gui-bar",
  title,
  onPress,
  children,
}: {
  handle: DragHandleProps;
  label: string;
  className?: string;
  title?: string;
  /** Pressing the bar selects its entity, as a click on core's bar does. */
  onPress?: () => void;
  children: ReactNode;
}) {
  const { ref, onPointerDown, onKeyDown, ...attributes } = handle;
  return (
    // The bar takes pointer drags as core's handle does; the grip is its keyboard control.
    <div
      className={className}
      title={title}
      onPointerDown={(event) => {
        onPress?.();
        // Core's sortable cancels drags that start on the bar's own controls.
        if (!(event.target instanceof Element && event.target.closest(BAR_CONTROLS)))
          onPointerDown?.(event);
      }}
    >
      <span
        ref={ref}
        className="afreact-drag-handle"
        {...attributes}
        onKeyDown={onKeyDown}
        aria-label={ts("Move %1", { 1: label })}
        title={ts("Drag to reposition")}
      />
      {children}
    </div>
  );
}

/** af-gui-menu: the gear button and its menu, built while open. */
export function GearMenu({
  alignRight = false,
  pullRight = true,
  children,
}: {
  alignRight?: boolean;
  /** False where the bar's own right-floated group holds it, as on containers. */
  pullRight?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  return (
    <Dropdown
      groupClass={pullRight ? "btn-group pull-right" : "btn-group"}
      buttonClass="btn btn-default btn-xs dropdown-toggle af-gui-add-element-button"
      title={ts("Configure")}
      label={
        <span>
          <i className="crm-i fa-gear" role="img" aria-hidden="true" />
        </span>
      }
      alignRight={alignRight}
    >
      {children}
    </Dropdown>
  );
}

/** A menu entry holding controls, as core's `.af-gui-field-select-in-dropdown`. */
export function MenuControls({
  children,
  inline = true,
}: {
  children: ReactNode;
  inline?: boolean;
}) {
  return (
    <li>
      <div
        className={
          inline ? "af-gui-field-select-in-dropdown form-inline" : "af-gui-field-select-in-dropdown"
        }
      >
        {children}
      </div>
    </li>
  );
}

export function MenuDivider() {
  return <li role="separator" className="divider" />;
}

export function MenuAction({
  onClick,
  icon,
  danger = false,
  children,
}: {
  onClick: () => void;
  icon?: string;
  danger?: boolean;
  children: ReactNode;
}) {
  const content = (
    <>
      {icon && <i className={`crm-i ${icon}`} role="img" aria-hidden="true" />} {children}
    </>
  );
  return (
    <li>
      <MenuLink onClick={onClick}>
        {danger ? <span className="text-danger">{content}</span> : content}
      </MenuLink>
    </li>
  );
}

/** A menu entry switching a setting, its state in a square (on/off) or circle (one of a set). */
export function MenuCheck({
  checked,
  onClick,
  title,
  shape = "square",
  children,
}: {
  checked: boolean;
  onClick: () => void;
  title?: string;
  shape?: "square" | "circle";
  children: ReactNode;
}) {
  return (
    <li>
      <MenuLink onClick={onClick} title={title} pressed={checked}>
        <i
          className={`crm-i fa-${checked ? "check-" : ""}${shape}-o`}
          role="img"
          aria-hidden="true"
        />{" "}
        {children}
      </MenuLink>
    </li>
  );
}

/** A delete entry: the element goes, and the menu with it. */
export function DeleteAction({ ops, label }: { ops: NodeOps; label: string }) {
  return (
    <MenuAction onClick={ops.remove} icon="fa-trash" danger>
      {label}
    </MenuAction>
  );
}

/** A select on the classes of `options`, one at most; afGui.modifyClasses keeps the others. */
function classOf(node: ShallowElement, options: string[]): string {
  return splitClass(textAttribute(node, "class")).find((name) => options.includes(name)) ?? "";
}

/** afGuiMenuItemStyle: the container style class. */
export function StyleMenuItem({ ops }: { ops: NodeOps }) {
  const editor = useEditor();
  const id = useId();
  const styles = editor.meta.admin.afform_container_style;
  const values = styles.map((style) => style.value);
  return (
    <MenuControls>
      <label htmlFor={id}>{ts("Style:")}</label>{" "}
      <select
        id={id}
        className="form-control"
        value={classOf(ops.node, values)}
        onChange={(event) => {
          const value = event.target.value;
          ops.edit((node) => modifyClasses(node, values, value || null));
        }}
      >
        <option value="">{ts("None")}</option>
        {styles.map((style) => (
          <option key={style.value} value={style.value}>
            {style.label}
          </option>
        ))}
      </select>
    </MenuControls>
  );
}

const BORDER_STYLES = (): [string, string][] => [
  ["", ts("No border")],
  ["solid", ts("Solid")],
  ["dotted", ts("Dotted")],
  ["dashed", ts("Dashed")],
  ["double", ts("Double")],
  ["groove", ts("Groove")],
  ["ridge", ts("Ridge")],
  ["inset", ts("Inset")],
  ["outset", ts("Outset")],
];

/** afGuiMenuItemBorder: the border's width, style and colour, kept in the style attribute. */
export function BorderMenuItem({ ops }: { ops: NodeOps }) {
  const parts = (getStyles(ops.node).border ?? "").split(" ").map((part) => part.trim());
  const border = parts.length > 2 ? parts : ["1px", "", "#000000"];
  const set = (index: number, value: string) => {
    const next = [...border];
    next[index] = value;
    ops.edit((node) => setStyle(node, "border", value ? next.join(" ") : ""));
  };
  const style = border[1] ?? "";
  return (
    <MenuControls>
      <select
        className="form-control"
        aria-label={ts("Border style")}
        value={style}
        onChange={(event) => {
          set(1, event.target.value);
        }}
      >
        {BORDER_STYLES().map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {style && (
        <>
          {" "}
          <select
            className="form-control"
            aria-label={ts("Border width")}
            value={border[0]}
            onChange={(event) => {
              set(0, event.target.value);
            }}
          >
            {["1px", "2px", "3px", "4px", "5px", "6px", "7px", "8px", "9px"].map((width) => (
              <option key={width} value={width}>
                {width}
              </option>
            ))}
          </select>{" "}
          <input
            type="color"
            className="form-control"
            aria-label={ts("Border color")}
            value={border[2]}
            onChange={(event) => {
              set(2, event.target.value);
            }}
          />
        </>
      )}
    </MenuControls>
  );
}

/** afGuiMenuItemBackground: the background colour. */
export function BackgroundMenuItem({ ops }: { ops: NodeOps }) {
  const id = useId();
  const color = getStyles(ops.node)["background-color"];
  return (
    <MenuControls>
      <label htmlFor={id}>{ts("Background:")}</label>{" "}
      <input
        id={id}
        type="color"
        className="form-control"
        value={color ?? "#ffffff"}
        onChange={(event) => {
          const value = event.target.value;
          ops.edit((node) => setStyle(node, "background-color", value));
        }}
      />
      {color && (
        <button
          type="button"
          className="btn btn-link btn-xs"
          title={ts("Remove background")}
          aria-label={ts("Remove background")}
          onClick={() => {
            ops.edit((node) => setStyle(node, "background-color", ""));
          }}
        >
          <i className="crm-i fa-times" role="img" aria-hidden="true" />
        </button>
      )}
    </MenuControls>
  );
}

/** afGuiMenuItemCollapsible: a `details` element starts closed unless it has `open`. */
export function CollapsibleMenuItem({ ops }: { ops: NodeOps }) {
  const collapsed = !("open" in ops.node);
  return (
    <MenuControls>
      <label>
        <input
          type="checkbox"
          checked={collapsed}
          onChange={() => {
            ops.edit((node) =>
              "open" in node ? withoutAttributes(node, ["open"]) : { ...node, open: "" },
            );
          }}
        />{" "}
        {ts("Collapsed")}
      </label>
    </MenuControls>
  );
}

/** The conditional rules entry, where the form has entities to refer to. */
export function ConditionalItem({
  ops,
  readOnlyField = false,
}: {
  ops: NodeOps;
  readOnlyField?: boolean;
}) {
  const editor = useEditor();
  if (!editor.entities.length) return null;
  return <ConditionalMenuItem ops={ops} readOnlyField={readOnlyField} />;
}
