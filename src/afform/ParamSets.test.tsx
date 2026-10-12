import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderWithQuery } from "../test/render";
import { memoryStore } from "../url/hash";
import { AfreactForm } from "./AfreactForm";
import { layoutProblems } from "./support";
import type { LayoutNode } from "./types";

const layout = (picker: LayoutNode = { "#tag": "af-search-param-sets" }): LayoutNode[] => [
  {
    "#tag": "div",
    "af-fieldset": "",
    "#children": [
      picker,
      {
        "#tag": "af-field",
        name: "title",
        defn: {
          name: "title",
          label: "Title",
          input_type: "Text",
          data_type: "String",
          search_operator: "CONTAINS",
        },
      },
      {
        "#tag": "crm-search-display-table",
        "search-name": "Groups_search",
        "display-name": "Groups",
        settings: {
          columns: [
            { type: "field", key: "title", label: "Title" },
            { type: "field", key: "description", label: "Description" },
          ],
          toggleColumns: true,
          limit: 5,
          pager: false,
        },
      },
    ],
  },
];

const NEWS = {
  id: 4,
  label: "News",
  filters: { title: { CONTAINS: "News" } },
  columns: [],
  "created_by.display_name": null,
  created_date: "2026-01-02 10:00:00",
};
const SETS = [NEWS];

function renderPicker(hash: string, handlers = {}, nodes = layout()) {
  let sets: typeof SETS = SETS;
  const calls = mockApi({
    "Afreact.getForm": () => [
      { name: "afsearchGroups", title: "Groups", type: "search", layout: nodes, strings: [] },
    ],
    "SearchDisplay.run": () => [{ key: 1, columns: [{ val: "Row" }, { val: "Text" }] }],
    "SearchParamSet.get": (params: Record<string, unknown>) =>
      Array.isArray(params.where) && params.where.length === 1
        ? sets
        : sets.filter((set) =>
            JSON.stringify(params.where).includes(`"id","=","${String(set.id)}"`),
          ),
    ...handlers,
  });
  const store = memoryStore(hash);
  renderWithQuery(<AfreactForm name="afsearchGroups" location={{ search: "", hash }} />, store);
  const setSets = (next: typeof SETS) => {
    sets = next;
  };
  return { calls, store, setSets };
}

const written = (calls: { call: string; params: Record<string, unknown> }[], call: string) =>
  calls.filter((each) => each.call === call).map((each) => each.params);

describe("ParamSets", () => {
  // deviation:param-sets-select-label
  it("picks a set into the URL and clears it again", async () => {
    const { store } = renderPicker("");
    const select = await screen.findByRole("combobox", { name: "Saved searches" });
    await userEvent.selectOptions(select, "News");
    expect(store.params().toString()).toBe("_s=4");
    expect(await screen.findByRole("textbox", { name: "Title" })).toHaveValue("News");
    await waitFor(() => {
      expect(select).toHaveValue("4");
    });
    await userEvent.click(screen.getByRole("button", { name: "Clear saved search" }));
    expect(store.params().toString()).toBe("_s=0");
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("");
  });

  it("gives the fields their defaults again once the set is cleared, as afFormReset does", async () => {
    const nodes = layout();
    const fieldset = nodes[0];
    if (!fieldset || !("#children" in fieldset)) throw new Error("fixture");
    fieldset["#children"]?.splice(1, 0, {
      "#tag": "af-field",
      name: "description",
      defn: {
        name: "description",
        label: "Description",
        input_type: "Text",
        data_type: "String",
        afform_default: "Plain",
      },
    });
    const { store } = renderPicker("#?_s=4", {}, nodes);
    const title = await screen.findByRole("textbox", { name: "Title" });
    const description = screen.getByRole("textbox", { name: "Description" });
    await waitFor(() => {
      expect(title).toHaveValue("News");
    });
    // The set names no description, so it is empty while the set applies.
    expect(description).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "Clear saved search" }));
    expect(store.params().toString()).toBe("_s=0");
    await waitFor(() => {
      expect(description).toHaveValue("Plain");
    });
    expect(title).toHaveValue("");
  });

  it("saves the typed filters and picked columns as a new set and applies it", async () => {
    const user = userEvent.setup();
    const { calls, store, setSets } = renderPicker("", {
      "SearchParamSet.create": () => {
        setSets([...SETS, { ...NEWS, id: 9, label: "Mine" }]);
        return [{ id: 9 }];
      },
    });
    const save = await screen.findByRole("button", { name: "Save new" });
    expect(save).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Ne");
    await user.click(screen.getByText("Pick Columns"));
    await user.click(screen.getByRole("checkbox", { name: "Description" }));
    await user.click(save);
    const dialog = screen.getByRole("dialog", { name: "Save new search" });
    expect(within(dialog).getByText("CONTAINS Ne")).toBeInTheDocument();
    expect(within(dialog).getByText("Title", { selector: "dd" })).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Save" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Mine");
    await user.click(confirm);
    await waitFor(() => {
      expect(store.params().toString()).toBe("_s=9");
    });
    expect(written(calls, "SearchParamSet.create")).toEqual([
      {
        values: {
          afform_name: "afsearchGroups",
          filters: { title: { CONTAINS: "Ne" } },
          columns: { "Groups_search.Groups": { title: "Title" } },
          label: "Mine",
          created_by: window.CRM.config?.cid,
        },
      },
    ]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers to save changes only once the values differ from the set", async () => {
    const user = userEvent.setup();
    const { calls, store } = renderPicker("#?_s=4", { "SearchParamSet.update": () => [] });
    const title = await screen.findByRole("textbox", { name: "Title" });
    await waitFor(() => {
      expect(title).toHaveValue("News");
    });
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    await user.clear(title);
    await user.type(title, "Old");
    await user.click(await screen.findByRole("button", { name: "Save changes" }));
    const dialog = screen.getByRole("dialog", { name: "Updating News" });
    expect(within(dialog).getByText("CONTAINS News => CONTAINS Old")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      expect(written(calls, "SearchParamSet.update")).toEqual([
        {
          where: [["id", "=", 4]],
          values: { label: "News", filters: { title: { CONTAINS: "Old" } }, columns: {} },
        },
      ]);
    });
    // The set stays named in the URL, with what differs from it.
    expect(store.params().get("_s")).toBe("4");
  });

  it("lists the sets to open or delete", async () => {
    const user = userEvent.setup();
    const { calls, store, setSets } = renderPicker("", {
      "SearchParamSet.delete": () => {
        setSets([]);
        return [];
      },
    });
    await user.click(await screen.findByRole("button", { name: "Manage" }));
    const dialog = screen.getByRole("dialog", { name: "Saved searches" });
    expect(within(dialog).getByText("CONTAINS News")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Open" }));
    expect(store.params().toString()).toBe("_s=4");
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Manage" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete", hidden: true }),
    );
    expect(
      await within(screen.getByRole("dialog")).findByText(
        "No filter sets have been created for this form.",
      ),
    ).toBeInTheDocument();
    expect(written(calls, "SearchParamSet.delete")).toEqual([{ where: [["id", "=", 4]] }]);
  });

  // deviation:param-sets-show-errors
  it("shows a failed save in the dialog and a failed list as an error", async () => {
    const user = userEvent.setup();
    renderPicker("", {
      "SearchParamSet.create": () => {
        throw new Error("Denied");
      },
    });
    await user.type(await screen.findByRole("textbox", { name: "Title" }), "x");
    await user.click(screen.getByRole("button", { name: "Save new" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Mine");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Denied");
  });

  it("fails loudly when the sets cannot be listed", async () => {
    renderPicker("", {
      "SearchParamSet.get": () => {
        throw new Error("No access");
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("No access");
    expect(screen.getByRole("button", { name: "Save this search" })).toBeInTheDocument();
  });

  it("notes a picker outside a search fieldset", () => {
    expect(layoutProblems(layout())).toEqual([]);
    expect(layoutProblems([{ "#tag": "af-search-param-sets" }])).toEqual([
      "af-search-param-sets outside a search fieldset",
    ]);
  });
});
