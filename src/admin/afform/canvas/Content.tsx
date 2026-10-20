import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { IconPicker } from "../../widgets/IconPicker";
import { InlineEdit } from "../../widgets/InlineEdit";
import { useEditor, type EditorApi } from "../context";
import { filled, textAttribute } from "../model";
import { modifyClasses, splitClass } from "../nodes";
import { formTokens, type TokenGroup } from "../tokens";
import { isElement, type ShallowElement } from "../tree";
import {
  BackgroundMenuItem,
  BorderMenuItem,
  ConditionalItem,
  DeleteAction,
  ElementBar,
  GearMenu,
  MenuAction,
  MenuControls,
  MenuDivider,
  useNodeOps,
  type ElementProps,
} from "./common";
import { pickIcon, styleOf } from "./Container";

/** The element's first text child, which the text and button elements edit. */
export function firstText(node: ShallowElement): string {
  const child = node["#children"]?.[0];
  return child && !isElement(child) && "#text" in child ? child["#text"] : "";
}

export const withText = (node: ShallowElement, text: string): ShallowElement => ({
  ...node,
  "#children": [{ "#text": text }, ...(node["#children"]?.slice(1) ?? [])],
});

/** The style class among `options` the element has, or undefined. */
const classAmong = (node: ShallowElement, options: string[]) =>
  splitClass(textAttribute(node, "class")).find((name) => options.includes(name));

/** CRM.afGuiEditor.styles with a prefix: `text-primary`, `btn-primary`. */
const prefixedStyles = (editor: EditorApi, prefix: string): [string, string][] =>
  Object.entries(editor.meta.gui.styles).map(([key, label]) => [`${prefix}-${key}`, label]);

function ColorMenuItem({
  prefix,
  styles,
  value,
  onChange,
}: {
  /** The style classes' prefix, `text` or `btn`. */
  prefix: string;
  styles: [string, string][];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <MenuControls>
      <label htmlFor={id}>{ts("Color:")}</label>{" "}
      <select
        id={id}
        className={`form-control ${value.replace(prefix, "text")}`}
        title={ts("Button color scheme")}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {/* Angular's unknown option: without a style class nothing is chosen, so Default can be. */}
        {!styles.some(([style]) => style === value) && <option value={value} />}
        {styles.map(([style, label]) => (
          <option key={style} value={style} className={style.replace(prefix, "bg")}>
            {label}
          </option>
        ))}
      </select>
    </MenuControls>
  );
}

const textTags = (): Record<string, string> => ({
  p: ts("Paragraph"),
  legend: ts("Fieldset Legend"),
  h1: ts("Heading 1"),
  h2: ts("Heading 2"),
  h3: ts("Heading 3"),
  h4: ts("Heading 4"),
  h5: ts("Heading 5"),
  h6: ts("Heading 6"),
});

const alignments = (): [string, string][] => [
  ["text-left", ts("Align left")],
  ["text-center", ts("Align center")],
  ["text-right", ts("Align right")],
  ["text-justify", ts("Justify")],
];

/** afGuiText: a paragraph, legend or heading, its text edited in place. */
export function TextElement({ path, node, handle, label }: ElementProps) {
  const editor = useEditor();
  const ops = useNodeOps(path, node);
  const tagId = useId();
  const align = alignments();
  const alignKeys = align.map(([key]) => key);
  const currentAlign = classAmong(node, alignKeys) ?? "text-left";
  const styles = prefixedStyles(editor, "text");
  const styleKeys = styles.map(([key]) => key);
  const tags = textTags();
  return (
    <div className="af-gui-element af-gui-text">
      <ElementBar handle={handle} label={label}>
        <div className="form-inline pull-right">
          <GearMenu>
            {() => (
              <>
                <MenuControls inline={false}>
                  <label htmlFor={tagId}>{ts("Element:")}</label>
                  <select
                    id={tagId}
                    className="form-control"
                    title={ts("Text style")}
                    value={node["#tag"]}
                    onChange={(event) => {
                      const tag = event.target.value;
                      ops.edit((current) => ({ ...current, "#tag": tag }));
                    }}
                  >
                    {Object.entries(tags).map(([tag, text]) => (
                      <option key={tag} value={tag}>
                        {text}
                      </option>
                    ))}
                  </select>
                </MenuControls>
                <MenuControls inline={false}>
                  <div className="btn-group btn-group-sm" role="group" aria-label={ts("Alignment")}>
                    {align.map(([key, text]) => (
                      <button
                        key={key}
                        type="button"
                        className={
                          key === currentAlign ? "btn btn-default active" : "btn btn-default"
                        }
                        title={text}
                        aria-label={text}
                        aria-pressed={key === currentAlign}
                        onClick={() => {
                          ops.edit((current) =>
                            modifyClasses(current, alignKeys, key === "text-left" ? null : key),
                          );
                        }}
                      >
                        <i
                          className={`crm-i fa-${key.replace("text", "align")}`}
                          role="img"
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                  </div>
                </MenuControls>
                <ColorMenuItem
                  prefix="text"
                  styles={styles}
                  value={classAmong(node, styleKeys) ?? "text-default"}
                  onChange={(value) => {
                    ops.edit((current) =>
                      modifyClasses(current, styleKeys, value === "text-default" ? null : value),
                    );
                  }}
                />
                <ConditionalItem ops={ops} />
                <MenuDivider />
                <DeleteAction ops={ops} label={ts("Delete this text")} />
              </>
            )}
          </GearMenu>
        </div>
      </ElementBar>
      <p
        className={`af-gui-node-title ${textAttribute(node, "class") ?? ""} af-gui-text-${node["#tag"]}`}
      >
        <InlineEdit
          label={ts("Text")}
          value={firstText(node)}
          onChange={(text) => {
            ops.edit((current) => withText(current, text));
          }}
        />
      </p>
    </div>
  );
}

/** afGuiButton: a button's text, icon and colour. */
export function ButtonElement({ path, node, handle, label }: ElementProps) {
  const editor = useEditor();
  const ops = useNodeOps(path, node);
  const textId = useId();
  const styles = prefixedStyles(editor, "btn");
  const styleKeys = styles.map(([key]) => key);
  const style = classAmong(node, styleKeys) ?? "";
  const icon = textAttribute(node, "crm-icon") ?? "";
  const setIcon = (value: string) => {
    ops.edit((current) => ({ ...current, "crm-icon": value }));
  };
  return (
    <div className="af-gui-element af-gui-button">
      <ElementBar handle={handle} label={label}>
        <div className="form-inline pull-right">
          <GearMenu>
            {() => (
              <>
                <MenuControls inline={false}>
                  <label htmlFor={textId}>{ts("Text:")}</label>
                  <input
                    id={textId}
                    type="text"
                    className="form-control"
                    value={firstText(node)}
                    onChange={(event) => {
                      const text = event.target.value;
                      ops.edit((current) => withText(current, text));
                    }}
                  />
                </MenuControls>
                <MenuControls inline={false}>
                  <IconPicker label={ts("Icon:")} value={icon} onChange={setIcon} />
                </MenuControls>
                <ColorMenuItem
                  prefix="btn"
                  styles={styles}
                  value={style}
                  onChange={(value) => {
                    ops.edit((current) => modifyClasses(current, styleKeys, ["btn", value]));
                  }}
                />
                <ConditionalItem ops={ops} />
                <MenuDivider />
                <DeleteAction ops={ops} label={ts("Delete this button")} />
              </>
            )}
          </GearMenu>
        </div>
      </ElementBar>
      <span className={`btn ${style}`}>
        <button
          type="button"
          className="btn btn-link btn-xs crm-editable-enabled afreact-icon-button"
          aria-label={ts("Choose icon")}
          title={ts("Choose icon")}
          onClick={() => {
            pickIcon(editor, ts("Choose icon"), setIcon);
          }}
        >
          <i className={`crm-i ${filled(icon) ?? "fa-"}`} role="img" aria-hidden="true" />
        </button>{" "}
        <InlineEdit
          label={ts("Button text")}
          value={firstText(node)}
          onChange={(text) => {
            ops.edit((current) => withText(current, text));
          }}
        />
      </span>
    </div>
  );
}

/** Core's `<civi-rich-text-input>` (js/wysiwyg/crm.wysiwyg.js). */
export interface RichTextElement extends HTMLElement {
  value: string;
  input: HTMLTextAreaElement;
  openEditor: () => void;
  closeEditor: () => void;
  saveAndCloseEditor: () => void;
  getTokens: () => { results: TokenGroup[] };
}

const isRichText = (element: Element): element is RichTextElement =>
  "openEditor" in element && typeof element.openEditor === "function";

/** Applies what every open rich text editor holds, as core does before saving. */
export function applyOpenRichText(root: ParentNode = document) {
  for (const element of root.querySelectorAll("civi-rich-text-input[editing]"))
    if (isRichText(element)) element.saveAndCloseEditor();
}

/**
 * Core's rich text element, holding `value` until it is edited. A value changed from outside,
 * by undo or another element taking this place, discards an open edit.
 */
export function RichTextInput({
  value,
  onChange,
  tokens,
  elementRef,
}: {
  value: string;
  onChange: (value: string) => void;
  tokens: () => TokenGroup[];
  elementRef: { current: RichTextElement | null };
}) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ value, onChange, tokens });
  useEffect(() => {
    latest.current = { value, onChange, tokens };
  });
  // A layout effect, so the element is closed or parked before React detaches its host.
  useLayoutEffect(() => {
    const element = document.createElement("civi-rich-text-input");
    if (!isRichText(element)) throw new Error("civi-rich-text-input is not defined on this page.");
    element.setAttribute("token-picker", "");
    element.getTokens = () => ({ results: latest.current.tokens() });
    element.value = latest.current.value;
    const onElementChange = (event: Event) => {
      // The token picker's and the textarea's own change events bubble up as well; closing an
      // untouched editor changes nothing.
      if (event.target === element && element.value !== latest.current.value)
        latest.current.onChange(element.value);
    };
    element.addEventListener("change", onElementChange);
    // CKEditor 4 marks the textarea once its scripts have loaded and it starts; opened before
    // that, a start is pending. deviation:rich-text-starting-removed
    const enabled = () => element.input.classList.contains("crm-wysiwyg-enabled");
    let pending = false;
    let parked = false;
    const close = () => {
      element.closeEditor();
      element.remove();
    };
    new MutationObserver(() => {
      if (!enabled()) return;
      pending = false;
      if (parked) close();
    }).observe(element.input, { attributeFilter: ["class"] });
    const onOpen = (event: Event) => {
      if (event.target === element && !enabled()) pending = true;
    };
    element.addEventListener("load", onOpen);
    host.current?.append(element);
    elementRef.current = element;
    // A new, empty element opens straight away.
    if (!latest.current.value) element.openEditor();
    return () => {
      element.removeEventListener("change", onElementChange);
      element.removeEventListener("load", onOpen);
      elementRef.current = null;
      // Removed while loading, the editor would start on a detached textarea and throw; it cannot
      // be called off, so the element waits hidden on the page until it has started.
      parked = pending && !!window.CRM.config?.CKEditorCustomConfig;
      if (parked) {
        element.style.display = "none";
        document.body.append(element);
      } else close();
    };
  }, [elementRef]);
  useEffect(() => {
    const element = elementRef.current;
    if (!element || element.value === value) return;
    if (element.hasAttribute("editing")) element.closeEditor();
    element.value = value;
  }, [value, elementRef]);
  return <div ref={host} />;
}

/** afGuiMarkup: rich content, edited with the site's editor. */
export function MarkupElement({ path, node, handle, label }: ElementProps) {
  const editor = useEditor();
  const ops = useNodeOps(path, node);
  const element = useRef<RichTextElement | null>(null);
  return (
    <div className="af-gui-markup">
      <ElementBar handle={handle} label={label}>
        <div className="form-inline">
          <span>{ts("Rich content")}</span>
          <GearMenu>
            {(close) => (
              <>
                <MenuAction
                  onClick={() => {
                    close();
                    element.current?.openEditor();
                  }}
                >
                  {ts("Edit content")}
                </MenuAction>
                <MenuDivider />
                <BorderMenuItem ops={ops} />
                <BackgroundMenuItem ops={ops} />
                <ConditionalItem ops={ops} />
                <MenuDivider />
                <DeleteAction ops={ops} label={ts("Delete this content")} />
              </>
            )}
          </GearMenu>
        </div>
      </ElementBar>
      <div
        className={`af-gui-markup-content ${textAttribute(node, "class") ?? ""}`}
        style={styleOf(node)}
      >
        <RichTextInput
          value={node["#markup"] ?? ""}
          elementRef={element}
          tokens={() => formTokens(editor, false)}
          onChange={(markup) => {
            ops.edit((current) => ({ ...current, "#markup": markup }));
          }}
        />
      </div>
    </div>
  );
}
