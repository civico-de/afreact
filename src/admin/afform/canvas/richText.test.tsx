import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RichTextInput, type RichTextElement } from "./Content";

const ENABLED = "crm-wysiwyg-enabled";
/** CKEditor 4's scripts: an editor opened before they load starts once they have. */
const scripts: { loaded: boolean; waiting: HTMLTextAreaElement[] } = { loaded: false, waiting: [] };
function loadScripts() {
  scripts.loaded = true;
  for (const input of scripts.waiting.splice(0)) input.classList.add(ENABLED);
}

/** Core's civi-rich-text-input with CKEditor 4, which marks the textarea when it starts. */
class FakeRichText extends HTMLElement {
  value = "";
  input = document.createElement("textarea");
  closings = 0;
  connectedCallback() {
    this.append(this.input);
  }
  openEditor() {
    this.setAttribute("editing", "");
    // crm.ckeditor.js leaves a started editor as it is.
    if (!this.input.classList.contains(ENABLED)) {
      if (scripts.loaded) this.input.classList.add(ENABLED);
      else scripts.waiting.push(this.input);
    }
    this.dispatchEvent(new Event("load"));
  }
  closeEditor() {
    this.closings += 1;
    this.input.classList.remove(ENABLED);
    this.removeAttribute("editing");
  }
  saveAndCloseEditor() {
    this.closeEditor();
  }
  getTokens() {
    return { results: [] };
  }
}
if (!customElements.get("civi-rich-text-input"))
  customElements.define("civi-rich-text-input", FakeRichText);

function opened() {
  const ref: { current: RichTextElement | null } = { current: null };
  const view = render(
    <RichTextInput value="" onChange={() => undefined} tokens={() => []} elementRef={ref} />,
  );
  const element = ref.current;
  if (!(element instanceof FakeRichText)) throw new Error("No rich text element");
  expect(element.hasAttribute("editing")).toBe(true);
  return { view, element };
}

/** Lets the mutation observers see the textarea's class. */
const observed = () => Promise.resolve();

describe("RichTextInput", () => {
  afterEach(() => {
    window.CRM.config = {};
    scripts.loaded = false;
    scripts.waiting = [];
  });

  // deviation:rich-text-starting-removed
  it("keeps an editor whose scripts still load on the page until it has started", async () => {
    window.CRM.config = { CKEditorCustomConfig: "/ckeditor-config.js" };
    const { view, element } = opened();
    view.unmount();
    expect(element.isConnected).toBe(true);
    expect(element.style.display).toBe("none");
    expect(element.closings).toBe(0);
    loadScripts();
    await observed();
    expect(element.closings).toBe(1);
    expect(element.isConnected).toBe(false);
  });

  // deviation:rich-text-starting-removed
  it("keeps an editor closed while its scripts load until it has started", async () => {
    window.CRM.config = { CKEditorCustomConfig: "/ckeditor-config.js" };
    const { view, element } = opened();
    element.closeEditor();
    view.unmount();
    expect(element.isConnected).toBe(true);
    loadScripts();
    await observed();
    expect(element.closings).toBe(2);
    expect(element.isConnected).toBe(false);
  });

  it("closes at once an editor started, opened again or closed after its scripts loaded", async () => {
    window.CRM.config = { CKEditorCustomConfig: "/ckeditor-config.js" };
    const first = opened();
    loadScripts();
    await observed();
    first.element.openEditor();
    first.element.closeEditor();
    await observed();
    first.view.unmount();
    const second = opened();
    await observed();
    second.view.unmount();
    expect([first.element.closings, second.element.closings]).toEqual([2, 1]);
    expect([first.element.isConnected, second.element.isConnected]).toEqual([false, false]);
  });

  it("closes at once an editor other than CKEditor 4", () => {
    const { view, element } = opened();
    view.unmount();
    expect(element.closings).toBe(1);
    expect(element.isConnected).toBe(false);
  });
});
