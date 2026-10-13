import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { mockApi, renderWithQuery } from "../../test/render";
import { IconDialog } from "../widgets/IconPicker";
import { ExportDialog } from "./ExportDialog";
import { ImportDialog } from "./ImportDialog";
import { SearchCondition } from "./SearchCondition";
import { SearchInput } from "./SearchInput";
import { SegmentDialog } from "./SegmentDialog";

const counted = <T,>(rows: T[], countMatched: number) => Object.assign(rows, { countMatched });

const metadata = {
  cacheKey: "k",
  schema: [
    {
      name: "Contact",
      title: "Contact",
      title_plural: "Contacts",
      searchable: "primary",
      primary_key: ["id"],
      fields: [
        { name: "first_name", label: "First Name", data_type: "String" },
        {
          name: "gender_id",
          label: "Gender",
          data_type: "Integer",
          options: true,
          suffixes: ["name", "label"],
        },
      ],
    },
  ],
  joins: {},
  operators: [
    { key: "=", value: "Is" },
    { key: "IN", value: "Is one of" },
    { key: "IS NULL", value: "Is empty" },
  ],
};

beforeEach(() => {
  const store = new Map<string, unknown>([["searchMeta2en_US", metadata]]);
  window.CRM.vars = {
    afreactAdmin: { searchAdmin: { defaultPagerSize: 50, modules: {}, cacheKey: "k", tags: [] } },
  };
  window.CRM.config = { cid: 2, lcMessages: "en_US" };
  window.CRM.cache = {
    get: (name) => store.get(name),
    set: (name, value) => void store.set(name, value),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(metadata)))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete window.CRM.vars;
  delete window.CRM.cache;
});

describe("ImportDialog", () => {
  it("previews the import, saves it and refreshes the metadata", async () => {
    const calls = mockApi({
      "Entity.get": () => [
        { name: "SavedSearch", title: "Saved Search", title_plural: "Saved Searches" },
      ],
      "SavedSearch.get": () => counted([], 0),
      "SavedSearch.save": () => [{ id: 1 }],
    });
    const onClose = vi.fn<(saved: boolean) => void>();
    renderWithQuery(<ImportDialog onClose={onClose} />);
    const input = screen.getByRole("textbox", { name: "Import" });
    fireEvent.change(input, {
      target: { value: '[["SavedSearch","save",{"records":[{"name":"a"}]}]]' },
    });
    expect(
      await screen.findByText("1 new Saved Search will be created.", {}, { timeout: 2000 }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledWith(true);
    });
    expect(calls.map((c) => c.call)).toContain("SavedSearch.save");
    expect(window.CRM.alert).toHaveBeenCalledWith(
      "1 record successfully imported.",
      "Saved",
      "success",
    );
    expect(fetch).toHaveBeenCalled();
  });

  it("shows why input cannot be imported and keeps the button off", async () => {
    mockApi({});
    renderWithQuery(<ImportDialog onClose={vi.fn<(imported: boolean) => void>()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Import" }), {
      target: { value: "[[1]]" },
    });
    expect(await screen.findByRole("alert", {}, { timeout: 2000 })).toHaveTextContent(
      'only "save"',
    );
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });
});

describe("SearchCondition", () => {
  function Harness({ initial }: { initial: unknown[] }) {
    const [clause, setClause] = useState(initial);
    return (
      <>
        <SearchCondition
          label="Gender"
          field={{
            name: "gender_id",
            data_type: "Integer",
            options: true,
            suffixes: ["name"],
            nullable: true,
          }}
          clause={clause}
          offset={1}
          operators={metadata.operators}
          optionKey="name"
          options={[
            { id: 1, name: "Female", label: "Female" },
            { id: 2, name: "Male", label: "Male" },
          ]}
          onChange={setClause}
        />
        <output>{JSON.stringify(clause)}</output>
      </>
    );
  }

  it("fits the value to the operator and picks options by their name", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Harness initial={["gender_id:name", "="]} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Value for Gender" }), "Male");
    expect(screen.getByRole("status")).toHaveTextContent('["gender_id:name","=","Male"]');
    await user.selectOptions(screen.getByRole("combobox", { name: "Operator for Gender" }), "IN");
    expect(screen.getByRole("status")).toHaveTextContent('["gender_id:name","IN",[]]');
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Operator for Gender" }),
      "IS NULL",
    );
    expect(screen.getByRole("status")).toHaveTextContent('["gender_id:name","IS NULL"]');
    expect(screen.queryByRole("combobox", { name: "Value for Gender" })).not.toBeInTheDocument();
  });

  it("gives a clause without an operator the first allowed one", () => {
    renderWithQuery(<Harness initial={["gender_id:name"]} />);
    expect(screen.getByRole("status")).toHaveTextContent('["gender_id:name","=",""]');
  });
});

describe("SegmentDialog", () => {
  it("builds items with conditions, reorders them and saves the segment", async () => {
    const calls = mockApi({
      "Contact.getFields": () => [
        { name: "gender_id", options: [{ id: 1, name: "Female", label: "Female" }] },
      ],
      "SearchSegment.save": () => [{ id: 3 }],
    });
    const onClose = vi.fn<(saved: boolean) => void>();
    const user = userEvent.setup();
    renderWithQuery(<SegmentDialog entity="Contact" onClose={onClose} />);
    const dialog = await screen.findByRole("dialog", { name: "New Search Segment" });
    await user.type(await within(dialog).findByRole("textbox", { name: "Name *" }), "Kind");
    await user.type(within(dialog).getByRole("textbox", { name: "Label of item 1" }), "Named");
    await user.type(within(dialog).getByRole("textbox", { name: "Value for First Name" }), "A");
    await user.click(within(dialog).getByRole("button", { name: "Default Item" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Label of item 2" }), "Other");
    await user.click(within(dialog).getByRole("button", { name: "Move Other up" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledWith(true);
    });
    expect(calls.find((c) => c.call === "SearchSegment.save")?.params).toEqual({
      records: [
        {
          label: "Kind",
          description: null,
          entity_name: "Contact",
          items: [{ label: "Other" }, { label: "Named", when: [["first_name", "=", "A"]] }],
        },
      ],
    });
  });
});

describe("ExportDialog", () => {
  it("leaves out an unchecked group and copies the output", async () => {
    mockApi({
      "SavedSearch.export": () => [
        { entity: "SavedSearch", params: { values: { name: "s" } } },
        { entity: "SearchDisplay", params: { values: { name: "d" } } },
      ],
    });
    // userEvent installs its own clipboard, which the dialog writes to.
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    renderWithQuery(
      <ExportDialog
        search={{
          id: 1,
          name: "s",
          label: "S",
          api_entity: "Contact",
          api_params: { version: 4 },
          display_name: ["d"],
        }}
        onClose={vi.fn<() => void>()}
      />,
    );
    await user.click(await screen.findByRole("checkbox", { name: "1 Display" }));
    const output = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Export" });
    expect(JSON.parse(output.value)).toEqual([
      ["SavedSearch", "save", { records: [{ name: "s" }] }],
    ]);
    expect(screen.getByRole("checkbox", { name: "0 Smart Groups" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Copy to clipboard" }));
    expect(writeText).toHaveBeenCalledWith(output.value);
    expect(screen.getByRole("button", { name: "Copied to clipboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Saved Search Criteria" })).toHaveAttribute(
      "href",
      `/civicrm/admin/search#/create/Contact?params=${encodeURIComponent('{"version":4}')}`,
    );
  });
});

describe("SearchInput dates", () => {
  it("follows a value that changes under it, as when items are reordered", () => {
    const field = { name: "created_date", label: "Created", data_type: "Date" };
    const { rerender } = renderWithQuery(
      <SearchInput
        id="d"
        field={field}
        op="="
        value="now - 3 day"
        onChange={vi.fn<(v: unknown) => void>()}
      />,
    );
    expect(document.querySelector<HTMLSelectElement>("#d")?.value).toBe("now -");
    rerender(
      <SearchInput
        id="d"
        field={field}
        op="="
        value="2026-01-01"
        onChange={vi.fn<(v: unknown) => void>()}
      />,
    );
    expect(document.querySelector<HTMLSelectElement>("#d")?.value).toBe("fixed");
  });
});

// deviation:dialog-return-focus
describe("focus on close", () => {
  function Opener({ dialog }: { dialog: (close: () => void) => ReactNode }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
          }}
        >
          Open
        </button>
        {open &&
          dialog(() => {
            setOpen(false);
          })}
      </>
    );
  }
  const search = {
    id: 1,
    name: "s",
    label: "S",
    api_entity: "Contact",
    api_params: { version: 4 },
    display_name: [],
  };
  const dialogs: [string, (close: () => void) => ReactNode][] = [
    ["import", (close) => <ImportDialog onClose={close} />],
    ["export", (close) => <ExportDialog search={search} onClose={close} />],
    ["segment", (close) => <SegmentDialog entity="Contact" onClose={close} />],
    [
      "icon",
      (close) => (
        <IconDialog label="Icon" transform="" required={false} onPick={close} onCancel={close} />
      ),
    ],
  ];

  it.each(dialogs)("goes back to the opener when the %s dialog closes", async (_, dialog) => {
    mockApi({ "SavedSearch.export": () => [] });
    renderWithQuery(<Opener dialog={dialog} />);
    const opener = screen.getByRole("button", { name: "Open" });
    await userEvent.click(opener);
    fireEvent(await screen.findByRole("dialog"), new Event("close"));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(opener).toHaveFocus();
  });
});
