import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { EditorContext, type EditorApi } from "../context";
import type { AfformDefinition } from "../meta";
import { META } from "../testMeta";
import { isElement } from "../tree";
import { TextElement } from "./Content";

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

function Canvas({ texts }: { texts: string[] }) {
  const [afform, setAfform] = useState<AfformDefinition>({
    type: "form",
    title: "Probe",
    layout: texts.map((text) => ({ "#tag": "p", "#children": [{ "#text": text }] })),
  });
  const editor: EditorApi = {
    meta: META,
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
  return (
    <EditorContext value={editor}>
      {afform.layout.map((node, index) =>
        isElement(node) ? (
          <TextElement
            key={index}
            path={[index]}
            node={node}
            scope={scope}
            handle={{ ref: () => undefined, "data-path": String(index), tabIndex: 0 }}
            label={`Text ${String(index + 1)}`}
          />
        ) : null,
      )}
    </EditorContext>
  );
}

async function deleteText(which: number) {
  const gear = screen.getAllByRole("button", { name: "Configure" }).at(which);
  if (!gear) throw new Error("No gear button.");
  await userEvent.click(gear);
  await userEvent.click(await screen.findByText(/Delete this text/));
}

describe("DeleteAction", () => {
  // deviation:delete-keeps-focus
  it("moves focus to the grip of the element that took the deleted one's place", async () => {
    render(<Canvas texts={["One", "Two"]} />);
    await deleteText(0);
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText("Move Text 1"));
    });
    expect(screen.getAllByRole("button", { name: "Configure" })).toHaveLength(1);
  });

  it("moves focus to the element before when the last one is deleted", async () => {
    render(<Canvas texts={["One", "Two"]} />);
    await deleteText(-1);
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText("Move Text 1"));
    });
  });
});
