import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { EditorContext, type EditorApi } from "../context";
import { parseAttribute } from "../literal";
import type { AfformDefinition, EditorMeta } from "../meta";
import { META } from "../testMeta";
import { isElement, type ShallowElement } from "../tree";
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
        },
      },
    },
  },
};

const scope = {
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
function Canvas({ field }: { field: ShallowElement }) {
  const [afform, setAfform] = useState<AfformDefinition>({
    type: "search",
    title: "Probe",
    layout: [field],
  });
  const [node] = afform.layout;
  latest = isElement(node) ? node : undefined;
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
});
