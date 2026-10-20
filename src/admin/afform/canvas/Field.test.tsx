import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { EditorContext, type EditorApi, type FormEntity } from "../context";
import { parseAttribute } from "../literal";
import type { AfformDefinition, EditorMeta } from "../meta";
import { META } from "../testMeta";
import { isElement, type ShallowElement } from "../tree";
import type { ContainerScope } from "./dropRules";
import { FieldElement } from "./Field";

const contribution = META.gui.entities.Contribution;
if (!contribution) throw new Error("The test metadata has no Contribution entity.");

/** Core's afGuiEditor settings: a timestamp field, and the relative date ranges of AfformAdminMeta. */
const meta: EditorMeta = {
  ...META,
  gui: {
    ...META.gui,
    inputTypes: ["Date", "Select", "Text"].map((name) => ({
      name,
      label: name,
      admin_template: `~/afGuiEditor/inputType/${name}.html`,
    })),
    dateRanges: [
      { id: "{}", label: "Choose Date Range" },
      { id: "this.day", label: "Today" },
      { id: "previous.week", label: "Previous week" },
    ],
    entities: {
      ...META.gui.entities,
      Contribution: {
        ...contribution,
        fields: {
          ...contribution.fields,
          receive_date: {
            name: "receive_date",
            label: "Date Received",
            input_type: "Date",
            data_type: "Timestamp",
          },
          is_test: { name: "is_test", label: "Test", input_type: "CheckBox", data_type: "Boolean" },
        },
      },
    },
  },
};

const searchScope = {
  path: [],
  entityName: null,
  dataEntity: "contributions.table",
  inFieldset: true,
  inBlock: false,
  join: null,
  label: "Search",
  axis: "y" as const,
};

let latest: ShallowElement | undefined;

/** A search form holding one field, every edit kept as the editor would save it. */
function Canvas({
  field,
  entities = [],
  scope = searchScope,
  type = "search",
}: {
  field: ShallowElement;
  entities?: FormEntity[];
  scope?: ContainerScope;
  type?: string;
}) {
  const [afform, setAfform] = useState<AfformDefinition>({
    type,
    title: "Probe",
    layout: [field],
  });
  const [node] = afform.layout;
  latest = isElement(node) ? node : undefined;
  const editor: EditorApi = {
    meta,
    afform,
    entities,
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
      <FieldElement
        path={[0]}
        node={latest}
        scope={scope}
        handle={{ ref: () => undefined, "data-path": "0", tabIndex: 0 }}
        label="Field"
      />
    </EditorContext>
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

const savedDefn = () => {
  const defn = latest?.defn;
  return typeof defn === "string" ? parseAttribute(defn) : defn;
};

describe("FieldElement", () => {
  describe("a date filter shown as a select", () => {
    const field = { "#tag": "af-field", name: "receive_date", defn: "{input_type: 'Select'}" };

    it("offers the relative date ranges by their labels as its default", async () => {
      render(<Canvas field={field} />);
      await userEvent.click(screen.getByRole("button", { name: "Set default value" }));
      expect(screen.getByText("Previous week")).toBeInTheDocument();
      expect(screen.queryByText("Choose Date Range")).toBeNull();
      await userEvent.click(screen.getByText("Today"));
      expect(savedDefn()).toEqual({ input_type: "Select", afform_default: "this.day" });
    });

    it("keeps the ranges with their labels as its own options", async () => {
      render(<Canvas field={field} />);
      await userEvent.click(screen.getByRole("button", { name: "Configure" }));
      await userEvent.click(screen.getByText("Customize options"));
      await userEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(savedDefn()).toEqual({
        input_type: "Select",
        options: [
          { id: "this.day", label: "Today" },
          { id: "previous.week", label: "Previous week" },
        ],
      });
    });
  });

  describe("a field's label", () => {
    it("is edited in place, an emptied one taking the field's own", () => {
      render(<Canvas field={{ "#tag": "af-field", name: "receive_date" }} />);
      const label = screen.getByRole("textbox", { name: "Field label" });
      label.textContent = "Received";
      fireEvent.blur(label);
      expect(savedDefn()).toEqual({ label: "Received" });
      label.textContent = "";
      fireEvent.blur(label);
      expect(label).toHaveTextContent("Date Received");
      expect(savedDefn() ?? {}).toEqual({});
    });

    it("names the entity and the field's own label in the bar's tooltip", () => {
      const individual = { name: "Individual1", type: "Individual", label: "Individual 1" };
      render(
        <Canvas
          type="form"
          field={{ "#tag": "af-field", name: "first_name" }}
          entities={[{ ...individual, path: [0], node: { "#tag": "af-entity" } }]}
          scope={{ ...searchScope, dataEntity: "", entityName: "Individual1" }}
        />,
      );
      expect(screen.getByTitle(/^Individual 1: /)).toBeInTheDocument();
    });

    it("calls a field without a name an extra one of its input type", () => {
      render(<Canvas field={{ "#tag": "af-field", defn: "{input_type: 'Text'}" }} />);
      expect(screen.getByTitle("Extra Text")).toBeInTheDocument();
    });
  });

  describe("a field that cannot be shown", () => {
    it("names a field missing from the metadata and can only be removed", async () => {
      render(<Canvas field={{ "#tag": "af-field", name: "no_such_field" }} />);
      expect(screen.getByText('Error: missing field "no_such_field"')).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Configure" }));
      expect(screen.getByText("Remove field")).toBeInTheDocument();
    });

    it("keeps settings it cannot read", () => {
      render(<Canvas field={{ "#tag": "af-field", name: "receive_date", defn: "{label: " }} />);
      expect(
        screen.getByText(
          "The settings of field receive_date cannot be read; saving keeps them unchanged.",
        ),
      ).toBeInTheDocument();
      expect(latest?.defn).toBe("{label: ");
    });
  });

  describe("a field's options", () => {
    it("gives a yes/no field a default of yes at once", async () => {
      render(<Canvas field={{ "#tag": "af-field", name: "is_test" }} />);
      await userEvent.click(screen.getByRole("button", { name: "Configure" }));
      await userEvent.click(screen.getByText("Default value"));
      expect(savedDefn()).toEqual({ afform_default: true });
    });

    it("offers a reference the form's entities of its type as default", async () => {
      const entity = (name: string, type: string) => ({
        name,
        type,
        label: name,
        path: [0],
        node: { "#tag": "af-entity" },
      });
      render(
        <Canvas
          type="form"
          field={{ "#tag": "af-field", name: "contact_id", defn: "{input_type: 'Select'}" }}
          entities={[entity("Individual1", "Individual"), entity("Contribution1", "Contribution")]}
          scope={{ ...searchScope, dataEntity: "", entityName: "Contribution1" }}
        />,
      );
      await userEvent.click(screen.getByRole("button", { name: "Set default value" }));
      expect(screen.queryByText("Contribution1")).toBeNull();
      await userEvent.click(screen.getByText("Individual1"));
      expect(savedDefn()).toEqual({ input_type: "Select", afform_default: "Individual1" });
    });
  });

  it("edits its help text above the input with the site's editor", () => {
    const { container } = render(
      <Canvas field={{ "#tag": "af-field", name: "receive_date", defn: "{help_pre: 'Before'}" }} />,
    );
    const editor = container.querySelector("civi-rich-text-input");
    if (!(editor instanceof FakeRichText)) throw new Error("No rich text element");
    expect(editor.value).toBe("Before");
    editor.value = "<p>When it arrived</p>";
    fireEvent.change(editor);
    expect(savedDefn()).toEqual({ help_pre: "<p>When it arrived</p>" });
  });
});
