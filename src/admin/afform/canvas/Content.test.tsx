import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentType } from "react";
import { EditorContext, type EditorApi } from "../context";
import type { AfformDefinition, EditorMeta } from "../meta";
import { META } from "../testMeta";
import { isElement, type ShallowElement } from "../tree";
import type { ElementProps } from "./common";
import { ButtonElement } from "./Content";

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
    <EditorContext value={editor}>
      <Element
        path={[0]}
        node={latest}
        scope={scope}
        handle={{ ref: () => undefined, "data-path": "0", tabIndex: 0 }}
        label="Element"
      />
    </EditorContext>
  );
}

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
