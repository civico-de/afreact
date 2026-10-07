import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { editInfo } from "../test/editInfo";
import { apiError, mockApi, recordParam, renderWithQuery } from "../test/render";
import { AfreactSearch } from "./AfreactSearch";
import type { DisplaySettings, Row } from "./types";

/** A full-row display of a name and two editable columns, the second one required. */
function setup({
  inlineEdit,
  readOnly = false,
  nickName = "Pi",
  toggleColumns = false,
  nickOptions = false,
  handlers = {},
}: {
  inlineEdit?: (params: Record<string, unknown>) => unknown;
  readOnly?: boolean;
  nickName?: string | null;
  toggleColumns?: boolean;
  /** The nick column as an option list whose options load on opening. */
  nickOptions?: boolean;
  handlers?: Parameters<typeof mockApi>[0];
} = {}) {
  const row = (title: unknown, nick: unknown, shown = String(title)): Row => ({
    key: 7,
    columns: [{ val: "Ada" }, { val: shown, edit: !readOnly }, { val: nick, edit: !readOnly }],
    data: { id: 7, job_title: title, nick_name: nick },
  });
  const settings: DisplaySettings = {
    columns: [
      { type: "field", key: "sort_name", label: "Name" },
      { type: "field", key: "job_title", label: "Title" },
      { type: "field", key: "nick_name", label: "Nick" },
    ],
    limit: 10,
    pager: false,
    toggleColumns,
    editableRow: { full: true },
  };
  const calls = mockApi({
    "SearchDisplay.run": () =>
      Object.assign([row("Pilot", nickName)], {
        editable: {
          job_title: editInfo({ value_key: "job_title" }),
          nick_name: editInfo({ value_key: "nick_name", nullable: false, options: nickOptions }),
        },
      }),
    "SearchDisplay.inlineEdit":
      inlineEdit ??
      ((params) => {
        const values = recordParam(params.values);
        return [row(values.job_title, values.nick_name, "Saved")];
      }),
    ...handlers,
  });
  renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
  const edits = () =>
    calls.filter(({ call }) => call === "SearchDisplay.inlineEdit").map(({ params }) => params);
  return { edits };
}

const openRow = async () => {
  await userEvent.click(await screen.findByRole("button", { name: "Edit Title Pilot" }));
};
const title = () => screen.getByLabelText("Title, Ada");
const nick = () => screen.getByLabelText("Nick, Ada");
const control = () => screen.getAllByRole("cell")[0]!;

describe("full-row editing", () => {
  it("opens every editable cell of the row and saves their values in one call", async () => {
    const { edits } = setup();
    await openRow();
    expect(title()).toHaveFocus();
    expect(nick()).toHaveValue("Pi");
    expect(document.querySelectorAll("td.crm-search-field-editing")).toHaveLength(2);
    // The row's buttons sit in the control column; the cells show none of their own.
    expect(within(control()).getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Save" })).toHaveLength(1);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();

    await userEvent.clear(title());
    await userEvent.type(title(), "Captain");
    // Moving on to the next cell leaves the row open.
    await userEvent.tab();
    expect(nick()).toHaveFocus();
    expect(edits()).toEqual([]);
    await userEvent.clear(nick());
    await userEvent.type(nick(), "Cap{Enter}");

    expect(edits()).toMatchObject([
      { rowKey: 7, values: { job_title: "Captain", nick_name: "Cap" } },
    ]);
    const saved = await screen.findByRole("button", { name: "Edit Title Saved" });
    expect(screen.getByRole("button", { name: "Edit Nick Cap" })).toBeInTheDocument();
    await waitFor(() => {
      expect(saved).toHaveFocus();
    });
  });

  it("saves with the row's button and cancels with Escape or its button", async () => {
    const { edits } = setup();
    await openRow();
    await userEvent.type(title(), "s");
    await userEvent.click(within(control()).getByRole("button", { name: "Save" }));
    expect(edits()).toMatchObject([{ values: { job_title: "Pilots", nick_name: "Pi" } }]);
    await screen.findByRole("button", { name: "Edit Title Saved" });

    await userEvent.click(screen.getByRole("button", { name: "Edit Nick Pi" }));
    await userEvent.type(nick(), "x{Escape}");
    expect(screen.queryByLabelText("Nick, Ada")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Nick Pi" })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Edit Title Saved" }));
    await userEvent.click(within(control()).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Title, Ada")).not.toBeInTheDocument();
    expect(edits()).toHaveLength(1);
  });

  it("closes an unchanged row without a call and holds an invalid one", async () => {
    const { edits } = setup();
    await openRow();
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByLabelText("Title, Ada")).not.toBeInTheDocument();
    expect(edits()).toEqual([]);

    await openRow();
    await userEvent.clear(nick());
    await userEvent.type(title(), "s{Enter}");
    expect(title()).toBeInTheDocument();
    expect(nick()).toBeInvalid();
    expect(edits()).toEqual([]);
  });

  it("keeps a failed row open with its values and the error in the control column", async () => {
    setup({
      inlineEdit: () => {
        throw apiError("Nope");
      },
    });
    await openRow();
    await userEvent.type(title(), "s{Enter}");
    const error = await within(control()).findByText("Nope");
    expect(title()).toHaveValue("Pilots");
    expect(title()).toHaveAttribute("aria-describedby", error.id);
    expect(nick()).toHaveAttribute("aria-describedby", error.id);
    expect(screen.getAllByText("Nope")).toHaveLength(1);
  });

  it("lets an untouched empty required cell be, as the server leaves it alone", async () => {
    const { edits } = setup({ nickName: null });
    await openRow();
    expect(nick()).not.toBeRequired();
    await userEvent.type(title(), "s{Enter}");
    expect(edits()).toMatchObject([{ values: { job_title: "Pilots", nick_name: null } }]);
    await screen.findByRole("button", { name: "Edit Title Saved" });

    // One the user emptied is held, as the server would skip it without a word.
    await userEvent.click(screen.getByRole("button", { name: "Edit Title Saved" }));
    await userEvent.type(nick(), "x");
    await userEvent.clear(nick());
    expect(nick()).toBeRequired();
    await userEvent.keyboard("{Enter}");
    expect(nick()).toBeInvalid();
    expect(edits()).toHaveLength(1);
  });

  it("leaves a column the picker hides out of the row", async () => {
    const { edits } = setup({ toggleColumns: true });
    await screen.findByRole("button", { name: "Edit Title Pilot" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Nick" }));
    await openRow();
    expect(screen.queryByLabelText("Nick, Ada")).not.toBeInTheDocument();
    await userEvent.type(title(), "s{Enter}");
    expect(edits()).toMatchObject([{ values: { job_title: "Pilots" } }]);
    expect(edits()[0]?.values).not.toHaveProperty("nick_name");
  });

  it("cancels with Escape on the row's buttons too", async () => {
    setup();
    await openRow();
    within(control()).getByRole("button", { name: "Cancel" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByLabelText("Title, Ada")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Title Pilot" })).toHaveFocus();
  });

  it("focuses the row's Cancel button while the clicked cell's options load", async () => {
    let answer: (fields: unknown[]) => void = () => undefined;
    setup({
      nickOptions: true,
      handlers: {
        "Contact.getFields": () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Edit Nick Pi" }));
    const cancel = within(control()).getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByLabelText("Title, Ada")).not.toBeInTheDocument();
    answer([]);
  });

  it("shows no buttons on a row the server marks read-only", async () => {
    setup({ readOnly: true });
    expect(await screen.findByRole("cell", { name: "Pilot" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});
