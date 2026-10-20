import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentType } from "react";
import { CoreVersion } from "../../version";
import { EditorContext, type EditorApi } from "../context";
import type { AfformDefinition, EditorMeta } from "../meta";
import { META } from "../testMeta";
import { isElement, type ShallowElement } from "../tree";
import type { ElementProps } from "./common";
import { ButtonElement, MarkupElement, TextElement } from "./Content";

/** CRM.afGuiEditor.styles, as AfformAdminMeta gives them. */
const meta: EditorMeta = {
  ...META,
  gui: {
    ...META.gui,
    styles: {
      default: "Default",
      primary: "Primary",
      success: "Success",
      info: "Info",
      warning: "Warning",
      danger: "Danger",
    },
  },
};

const scope = {
  path: [],
  entityName: null,
  dataEntity: "",
  inFieldset: false,
  inBlock: false,
  join: null,
  label: "Form",
  axis: "y" as const,
};

let latest: ShallowElement | undefined;

/** A form holding one element, every edit kept as the editor would save it. */
function Canvas({
  element: Element,
  node,
}: {
  element: ComponentType<ElementProps>;
  node: ShallowElement;
}) {
  const [afform, setAfform] = useState<AfformDefinition>({
    type: "form",
    title: "Probe",
    layout: [node],
  });
  const [first] = afform.layout;
  latest = isElement(first) ? first : undefined;
  const editor: EditorApi = {
    meta,
    afform,
    entities: [],
    change: (update) => {
      setAfform(update);
    },
    selected: null,
    select: () => undefined,
    addMeta: () => undefined,
    removeEntity: () => undefined,
    saveBlocked: null,
    openDialog: () => undefined,
  };
  if (!latest) return null;
  return (
    <CoreVersion value="6.20.0">
      <EditorContext value={editor}>
        <Element
          path={[0]}
          node={latest}
          scope={scope}
          handle={{ ref: () => undefined, "data-path": "0", tabIndex: 0 }}
          label="Element"
        />
      </EditorContext>
    </CoreVersion>
  );
}

/** Core's civi-rich-text-input, holding its value as the site's editor would. */
class FakeRichText extends HTMLElement {
  value = "";
  input = document.createElement("textarea");
  openEditor() {
    this.setAttribute("editing", "");
  }
  closeEditor() {
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

const openMenu = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Configure" }));
};

describe("ButtonElement", () => {
  const button = (attributes: Record<string, string>) => ({
    "#tag": "button",
    ...attributes,
    "#children": [{ "#text": "Submit" }],
  });

  it("gives a button without a colour the default one once it is chosen", async () => {
    render(<Canvas element={ButtonElement} node={button({ class: "af-button btn" })} />);
    await openMenu();
    const color = screen.getByLabelText("Color:");
    expect(color).toHaveValue("");
    await userEvent.selectOptions(color, "Default");
    expect(latest?.class).toBe("af-button btn btn-default");
  });

  it("trims its text as it is typed, keeping the input as typed", async () => {
    render(<Canvas element={ButtonElement} node={button({ class: "af-button btn" })} />);
    await openMenu();
    const text = screen.getByLabelText("Text:");
    await userEvent.clear(text);
    await userEvent.type(text, "Save ");
    expect(latest?.["#children"]).toEqual([{ "#text": "Save" }]);
    expect(text).toHaveValue("Save ");
    await userEvent.type(text, "draft");
    expect(latest?.["#children"]).toEqual([{ "#text": "Save draft" }]);
  });
});

describe("TextElement", () => {
  const text = (attributes: Record<string, string> = {}) => ({
    "#tag": "p",
    ...attributes,
    "#children": [{ "#text": "Intro" }, { "#tag": "br" }],
  });

  it("changes its tag, alignment and colour as afGuiText does", async () => {
    render(<Canvas element={TextElement} node={text({ class: "af-text" })} />);
    await openMenu();
    await userEvent.selectOptions(screen.getByLabelText("Element:"), "Heading 2");
    expect(latest?.["#tag"]).toBe("h2");
    await userEvent.click(screen.getByLabelText("Align center"));
    expect(latest?.class).toBe("af-text text-center");
    await userEvent.click(screen.getByLabelText("Align left"));
    expect(latest?.class).toBe("af-text");
    const color = screen.getByLabelText("Color:");
    expect(color).toHaveValue("text-default");
    await userEvent.selectOptions(color, "Danger");
    expect(latest?.class).toBe("af-text text-danger");
    await userEvent.selectOptions(color, "Default");
    expect(latest?.class).toBe("af-text");
  });

  it("edits its text in place, keeping what follows it", () => {
    render(<Canvas element={TextElement} node={text()} />);
    const input = screen.getByRole("textbox", { name: "Text" });
    input.textContent = "Welcome";
    fireEvent.blur(input);
    expect(latest?.["#children"]).toEqual([{ "#text": "Welcome" }, { "#tag": "br" }]);
  });
});

describe("MarkupElement", () => {
  it("keeps what the site's editor holds as its markup", () => {
    const { container } = render(
      <Canvas element={MarkupElement} node={{ "#tag": "div", "#markup": "<p>Hi</p>" }} />,
    );
    const editor = container.querySelector("civi-rich-text-input");
    if (!(editor instanceof FakeRichText)) throw new Error("No rich text element");
    expect(editor.value).toBe("<p>Hi</p>");
    editor.value = "<p>Hello</p>";
    fireEvent.change(editor);
    expect(latest?.["#markup"]).toBe("<p>Hello</p>");
  });

  it("opens the site's editor from its menu", async () => {
    const { container } = render(
      <Canvas element={MarkupElement} node={{ "#tag": "div", "#markup": "<p>Hi</p>" }} />,
    );
    const editor = container.querySelector("civi-rich-text-input");
    expect(editor?.hasAttribute("editing")).toBe(false);
    await openMenu();
    await userEvent.click(screen.getByText("Edit content"));
    expect(editor?.hasAttribute("editing")).toBe(true);
  });
});
