import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { Picker } from "./Picker";

const options = [
  { id: "Individual1.0.first_name", label: "First Name", group: "Individual1" },
  { id: "Individual1.0.last_name", label: "Last Name", group: "Individual1" },
  { id: "Individual2.0.first_name", label: "First Name", group: "Individual2" },
  { id: "token", label: "Submission JWT" },
];

test("lists options under their group's heading and picks one from a group", async () => {
  const onChange = vi.fn<(value: (string | number)[]) => void>();
  render(
    <Picker
      id="pick"
      label="Insert Token"
      hiddenLabel
      placeholder="Search"
      single
      openOnMount
      options={options}
      value={[]}
      onChange={onChange}
    />,
  );
  const input = await screen.findByRole("combobox", { name: "Insert Token" });
  expect(input).toHaveFocus();
  const list = await screen.findByRole("listbox");
  await waitFor(() => {
    expect(within(list).getAllByRole("group")).toHaveLength(2);
  });
  const second = within(list).getByRole("group", { name: "Individual2" });
  expect(
    within(second)
      .getAllByRole("option")
      .map((o) => o.textContent),
  ).toEqual(["First Name"]);
  expect(within(list).getAllByRole("option")).toHaveLength(4);
  await userEvent.click(within(second).getByRole("option", { name: "First Name" }));
  expect(onChange).toHaveBeenCalledWith(["Individual2.0.first_name"]);
});

test("filters by a group's name", async () => {
  render(
    <Picker
      id="pick"
      label="Field"
      placeholder="Search"
      single
      options={options}
      value={[]}
      onChange={vi.fn<(value: (string | number)[]) => void>()}
    />,
  );
  await userEvent.type(await screen.findByRole("combobox", { name: "Field" }), "individual2");
  const list = await screen.findByRole("listbox");
  await waitFor(() => {
    expect(within(list).getAllByRole("option")).toHaveLength(1);
  });
  expect(within(list).getByRole("group", { name: "Individual2" })).toBeInTheDocument();
});

test("lists and filters its options at once, with no search wait as a server search has", async () => {
  render(
    <Picker
      id="pick"
      label="Field"
      placeholder="Search"
      single
      options={options}
      value={[]}
      onChange={vi.fn<(value: (string | number)[]) => void>()}
    />,
  );
  const input = await screen.findByRole("combobox", { name: "Field" });
  vi.useFakeTimers();
  try {
    fireEvent.click(input);
    const list = screen.getByRole("listbox");
    expect(within(list).getAllByRole("option")).toHaveLength(4);
    expect(screen.queryByText("Searching...")).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "jwt" } });
    expect(
      within(list)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Submission JWT"]);
  } finally {
    vi.useRealTimers();
  }
});
