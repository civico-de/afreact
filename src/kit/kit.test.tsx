import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { vi } from "vitest";
import { listParam, mockApi, renderWithQuery } from "../test/render";
import { CountBadge } from "./CountBadge";
import { EntityPicker } from "./EntityPicker";
import { FieldCondition } from "./FieldCondition";
import { FieldPicker } from "./FieldPicker";
import type { KitField } from "./fields";
import { Notice } from "./Notice";

const FIELDS: Partial<KitField>[] = [
  { name: "birth_date", label: "Birth Date", type: "Field", data_type: "Date", input_type: "Date" },
  {
    name: "Volunteer.skill",
    label: "Skill",
    type: "Custom",
    data_type: "String",
    custom_field_id: 7,
  },
  { name: "contact_type", label: "Contact Type", type: "Field", data_type: "String" },
];

const fieldsApi = {
  "Contact.getFields": (params: Record<string, unknown>) => {
    expect(listParam(params.where)).toContainEqual(["type", "IN", ["Field", "Custom"]]);
    return FIELDS;
  },
  "CustomGroup.get": () => [{ name: "Volunteer", title: "Volunteer Info" }],
};

function PickerHarness({ onPick }: { onPick: (field: KitField | null) => void }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <FieldPicker
      id="field"
      entity="Contact"
      label="Field"
      value={value}
      onChange={(field) => {
        setValue(field?.name ?? null);
        onPick(field);
      }}
    />
  );
}

test("the field picker lists the entity's fields, then custom fields under their group", async () => {
  mockApi(fieldsApi);
  const onPick = vi.fn<(field: KitField | null) => void>();
  renderWithQuery(<PickerHarness onPick={onPick} />);
  const input = await screen.findByRole("combobox", { name: "Field" });
  await waitFor(() => {
    expect(input).toBeEnabled();
  });
  await userEvent.click(input);
  const list = await screen.findByRole("listbox");
  await waitFor(() => {
    expect(within(list).getAllByRole("option")).toHaveLength(3);
  });
  expect(
    within(list)
      .getAllByRole("option")
      .map((o) => o.textContent),
  ).toEqual(["Birth Date", "Contact Type", "Skill"]);
  const group = within(list).getByRole("group", { name: "Volunteer Info" });
  await userEvent.click(within(group).getByRole("option", { name: "Skill" }));
  expect(onPick).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Volunteer.skill",
      entity: "Contact",
      group: "Volunteer Info",
    }),
  );
});

test("the field picker reports a failed field list", async () => {
  mockApi({
    "Contact.getFields": () => {
      throw Object.assign(new Error("No access"), { error_message: "No access" });
    },
  });
  renderWithQuery(<PickerHarness onPick={vi.fn<(field: KitField | null) => void>()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("No access");
});

test("the field picker reports a custom field whose group it cannot find", async () => {
  mockApi({ ...fieldsApi, "CustomGroup.get": () => [] });
  renderWithQuery(<PickerHarness onPick={vi.fn<(field: KitField | null) => void>()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No custom group Volunteer for Volunteer.skill",
  );
});

let latest: unknown[] = [];

function ConditionHarness({
  field,
  initial,
  invalid,
  describedBy,
}: {
  field: KitField;
  initial: unknown[];
  invalid?: boolean;
  describedBy?: string;
}) {
  const [clause, setClause] = useState(initial);
  latest = clause;
  return (
    <FieldCondition
      field={field}
      clause={clause}
      onChange={setClause}
      invalid={invalid}
      describedBy={describedBy}
    />
  );
}

const birthDate: KitField = {
  name: "birth_date",
  label: "Birth Date",
  type: "Field",
  data_type: "Date",
  input_type: "Date",
  entity: "Contact",
};

test("a date condition offers the relative date filters", async () => {
  const calls = mockApi({
    "OptionValue.get": () => [
      { value: "this.year", label: "This calendar year" },
      { value: "previous.month", label: "Previous month" },
    ],
  });
  renderWithQuery(
    <ConditionHarness field={birthDate} initial={["birth_date", "=", "this.year"]} />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Loading...");
  const range = (await screen.findByRole("option", { name: "This calendar year" })).closest(
    "select",
  );
  if (!range) throw new Error("The range is no select's option.");
  expect(range).toHaveValue("this.year");
  expect(calls[0]?.params.where).toContainEqual([
    "option_group_id:name",
    "=",
    "relative_date_filters",
  ]);
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Operator for Birth Date" }),
    "<",
  );
  expect(latest).toEqual(["birth_date", "<", "this.year"]);
  await userEvent.selectOptions(range, "previous.month");
  expect(latest).toEqual(["birth_date", "<", "previous.month"]);
});

test("an option field's condition loads its options and takes several for IN", async () => {
  mockApi({
    "Contact.getFields": () => [
      {
        name: "contact_type",
        options: [
          { id: "Individual", name: "Individual", label: "Individual" },
          { id: "Organization", name: "Organization", label: "Organization" },
        ],
      },
    ],
  });
  const field: KitField = {
    name: "contact_type",
    label: "Contact Type",
    type: "Field",
    data_type: "String",
    options: true,
    suffixes: ["name", "label"],
    entity: "Contact",
  };
  renderWithQuery(<ConditionHarness field={field} initial={["contact_type", "IN", []]} />);
  const select = await screen.findByRole("listbox", { name: "Value for Contact Type" });
  await userEvent.selectOptions(select, ["Organization"]);
  expect(latest).toEqual(["contact_type", "IN", ["Organization"]]);
});

test("a condition reports options it could not load", async () => {
  mockApi({
    "Contact.getFields": () => {
      throw Object.assign(new Error("Denied"), { error_message: "Denied" });
    },
  });
  const field: KitField = { ...birthDate, data_type: "String", options: true, name: "gender_id" };
  renderWithQuery(<ConditionHarness field={field} initial={["gender_id", "=", ""]} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Denied");
});

test("a notice announces errors at once and other messages politely", () => {
  renderWithQuery(
    <>
      <Notice type="error">Broken</Notice>
      <Notice>Hint</Notice>
    </>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Broken");
  expect(screen.getByRole("alert")).toHaveClass("messages", "error", "no-popup");
  expect(screen.getByRole("status")).toHaveTextContent("Hint");
});

test("a count badge names what it counts and says while it counts", () => {
  const { rerender } = renderWithQuery(<CountBadge count={null} label="contacts" />);
  const counting = screen.getByText("Loading...").closest(".badge");
  expect(counting).toHaveAttribute("aria-busy", "true");
  expect(counting?.querySelector("i")).not.toHaveAttribute("role");
  rerender(<CountBadge count={12} label="contacts" />);
  const badge = screen.getByText("12", { exact: false });
  expect(badge).toHaveTextContent("12 contacts");
  expect(badge).not.toHaveAttribute("aria-busy");
});

test("an option condition stores the suffix it is given, from options the field carries", async () => {
  const calls = mockApi({});
  const field: KitField = {
    name: "contribution_status_id",
    label: "Contribution Status",
    type: "Field",
    data_type: "Integer",
    options: [
      { id: 1, name: "Completed", label: "Completed" },
      { id: 2, name: "Pending", label: "Pending (Pay Later)" },
    ],
    entity: "Contribution",
  };
  function Harness() {
    const [clause, setClause] = useState<unknown[]>(["contribution_status_id:name", "=", ""]);
    latest = clause;
    return <FieldCondition field={field} clause={clause} onChange={setClause} optionKey="name" />;
  }
  renderWithQuery(<Harness />);
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Value for Contribution Status" }),
    "Pending (Pay Later)",
  );
  expect(latest).toEqual(["contribution_status_id:name", "=", "Pending"]);
  expect(calls).toEqual([]);
});

/** A result of `<Entity>.autocomplete`, with the props CRM.api4 copies onto the list. */
const found = (items: { id: number; label: string }[]) =>
  Object.assign(items, { countFetched: items.length, countMatched: items.length });

function EntityHarness({
  multiple,
  onPick,
  invalid,
  describedBy,
}: {
  multiple: boolean;
  onPick: (ids: unknown[]) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [ids, setIds] = useState<(string | number)[]>(multiple ? [5] : []);
  return (
    <EntityPicker
      id="groups"
      entity="Group"
      label="Groups"
      multiple={multiple}
      invalid={invalid}
      describedBy={describedBy}
      value={ids}
      params={{ filters: { is_active: true } }}
      onChange={(next) => {
        setIds(next);
        onPick(next);
      }}
    />
  );
}

test("the entity picker searches the entity's autocomplete and hands back ids", async () => {
  const calls = mockApi({
    "Group.autocomplete": (params) =>
      "ids" in params
        ? found([{ id: 5, label: "Donors" }])
        : found([{ id: 7, label: "Volunteers" }]),
  });
  const onPick = vi.fn<(ids: unknown[]) => void>();
  renderWithQuery(<EntityHarness multiple onPick={onPick} />);
  const input = await screen.findByRole("combobox", { name: "Groups" });
  await waitFor(() => {
    expect(screen.getByText("Donors")).toBeInTheDocument();
  });
  await userEvent.type(input, "Vol");
  await userEvent.click(await screen.findByRole("option", { name: "Volunteers" }));
  expect(onPick).toHaveBeenLastCalledWith([5, 7]);
  const search = calls.find(
    ({ call, params }) => call === "Group.autocomplete" && !("ids" in params),
  );
  expect(search?.params).toMatchObject({ input: "Vol", filters: { is_active: true } });
  expect(search?.params).not.toHaveProperty("fieldName");
});

test("a single entity picker holds one id and offers no current-user button", async () => {
  mockApi({ "Group.autocomplete": () => found([{ id: 7, label: "Volunteers" }]) });
  const onPick = vi.fn<(ids: unknown[]) => void>();
  renderWithQuery(<EntityHarness multiple={false} onPick={onPick} />);
  const input = await screen.findByRole("combobox", { name: "Groups" });
  await userEvent.type(input, "V");
  await userEvent.click(await screen.findByRole("option", { name: "Volunteers" }));
  expect(onPick).toHaveBeenLastCalledWith([7]);
  expect(screen.queryByRole("button", { name: /Current User/ })).not.toBeInTheDocument();
});

const age: KitField = {
  name: "age",
  label: "Age",
  type: "Field",
  data_type: "Integer",
  input_type: "Number",
  entity: "Contact",
};

test("an invalid condition marks its operator and value inputs and points at the error", () => {
  mockApi({});
  renderWithQuery(
    <ConditionHarness field={age} initial={["age", "BETWEEN", [1, 2]]} invalid describedBy="err" />,
  );
  const inputs = [
    screen.getByRole("combobox", { name: "Operator for Age" }),
    ...screen.getAllByRole("spinbutton"),
  ];
  expect(inputs).toHaveLength(3);
  for (const input of inputs) {
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "err");
  }
});

test("a condition's entity reference carries the invalid state on its combobox", async () => {
  mockApi({});
  const owner: KitField = { ...age, name: "employer_id", label: "Employer", fk_entity: "Contact" };
  renderWithQuery(
    <ConditionHarness field={owner} initial={["employer_id", "=", ""]} invalid describedBy="err" />,
  );
  const input = await screen.findByRole("combobox", { name: "Value for Employer" });
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAttribute("aria-describedby", "err");
});

test("a condition without the invalid state sets neither attribute", () => {
  mockApi({});
  renderWithQuery(<ConditionHarness field={age} initial={["age", "=", 3]} />);
  for (const input of [
    screen.getByRole("combobox", { name: "Operator for Age" }),
    screen.getByRole("spinbutton", { name: "Value for Age" }),
  ]) {
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  }
});

test("an invalid entity picker marks its combobox and points at the error", async () => {
  mockApi({ "Group.autocomplete": () => found([]) });
  renderWithQuery(
    <EntityHarness
      multiple={false}
      onPick={vi.fn<(ids: unknown[]) => void>()}
      invalid
      describedBy="err"
    />,
  );
  const input = await screen.findByRole("combobox", { name: "Groups" });
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAttribute("aria-describedby", "err");
});

test("an invalid date condition marks each input of the date", async () => {
  mockApi({ "OptionValue.get": () => [] });
  renderWithQuery(
    <ConditionHarness
      field={birthDate}
      initial={["birth_date", "=", "now - 3 day"]}
      invalid
      describedBy="err"
    />,
  );
  const offset = await screen.findByRole("spinbutton");
  for (const input of [offset, ...screen.getAllByRole("combobox")]) {
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "err");
  }
});

// deviation:select-placeholder-text
test("pickers and option selects prompt with afreact's own Select… text", async () => {
  mockApi({ "Group.autocomplete": () => found([]) });
  const status: KitField = {
    ...age,
    name: "status",
    label: "Status",
    data_type: "String",
    options: [{ id: "a", name: "a", label: "A" }],
  };
  renderWithQuery(
    <>
      <EntityHarness multiple={false} onPick={vi.fn<(ids: unknown[]) => void>()} />
      <ConditionHarness field={status} initial={["status", "=", ""]} />
    </>,
  );
  expect(await screen.findByRole("combobox", { name: "Groups" })).toHaveAttribute(
    "placeholder",
    "Select…",
  );
  expect(
    within(screen.getByRole("combobox", { name: "Value for Status" })).getByRole("option", {
      name: "Select…",
    }),
  ).toHaveValue("");
});
