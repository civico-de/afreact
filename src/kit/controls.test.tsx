import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { vi } from "vitest";
import { ConditionGroup, type GroupOp } from "./ConditionGroup";
import { Picker, type PickerOption } from "./kit";
import { QuantityInput, type Quantity } from "./QuantityInput";
import { Select } from "./Select";
import { StepCounts, type Step } from "./StepCounts";

type Id = PickerOption["id"];

const DATES: PickerOption[] = [
  { id: "receive_date", label: "Received" },
  { id: 7, label: "Thank-you date", group: "Custom" },
  { id: 8, label: "Cancelled", group: "Custom" },
];

test("a select names itself, groups options and hands back the option's own id", async () => {
  const onChange = vi.fn<(value: Id | null) => void>();
  render(
    <Select
      id="date"
      label="Date field"
      placeholder="Any date"
      options={DATES}
      value="receive_date"
      onChange={onChange}
    />,
  );
  const select = screen.getByRole("combobox", { name: "Date field" });
  expect(select).toHaveValue("receive_date");
  const group = within(select).getByRole("group", { name: "Custom" });
  expect(
    within(group)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual(["Thank-you date", "Cancelled"]);
  await userEvent.selectOptions(select, "Thank-you date");
  expect(onChange).toHaveBeenLastCalledWith(7);
  await userEvent.selectOptions(select, "Any date");
  expect(onChange).toHaveBeenLastCalledWith(null);
});

test("a select inside a sentence keeps its name and carries the invalid state", () => {
  render(
    <Select
      id="date"
      label="Date field"
      hiddenLabel
      options={DATES}
      value={null}
      onChange={vi.fn<(value: Id | null) => void>()}
      invalid
      describedBy="err"
    />,
  );
  const select = screen.getByRole("combobox", { name: "Date field" });
  expect(screen.getByText("Date field")).toHaveClass("sr-only");
  expect(select).toHaveAttribute("aria-invalid", "true");
  expect(select).toHaveAttribute("aria-describedby", "err");
  expect(within(select).queryByRole("option", { name: "" })).not.toBeInTheDocument();
});

test("a single picker over a short list is chosen by keyboard alone", async () => {
  function Harness({ onPick }: { onPick: (id: Id | undefined) => void }) {
    const [value, setValue] = useState<Id[]>([]);
    return (
      <Picker
        id="type"
        label="Related records"
        placeholder="Related records"
        hiddenLabel
        single
        options={[
          { id: "Contribution", label: "Contributions" },
          { id: "Activity", label: "Activities" },
        ]}
        value={value}
        onChange={(next) => {
          setValue(next);
          onPick(next[0]);
        }}
      />
    );
  }
  const onPick = vi.fn<(id: Id | undefined) => void>();
  render(<Harness onPick={onPick} />);
  const input = await screen.findByRole("combobox", { name: "Related records" });
  await userEvent.tab();
  expect(input).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}");
  expect(await screen.findAllByRole("option")).toHaveLength(2);
  await userEvent.keyboard("{ArrowDown}{Enter}");
  expect(onPick).toHaveBeenLastCalledWith("Activity");
  expect(input).toHaveValue("Activities");
});

let quantity: { value: Quantity; invalid: boolean } | null = null;

function QuantityHarness({
  initial,
  invalid,
  hiddenLabel,
}: {
  initial: Quantity;
  invalid?: boolean;
  hiddenLabel?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <QuantityInput
      id="n"
      value={value}
      operatorLabel="How many"
      numberLabel="Number of records"
      hiddenLabel={hiddenLabel}
      invalid={invalid}
      describedBy={invalid ? "err" : undefined}
      onChange={(next, state) => {
        setValue(next);
        quantity = { value: next, invalid: state.invalid };
      }}
    />
  );
}

test("a quantity offers the three operators and takes a whole number", async () => {
  render(<QuantityHarness initial={{ op: ">=", n: 1 }} />);
  const op = screen.getByRole("combobox", { name: "How many" });
  expect(
    within(op)
      .getAllByRole("option")
      .map((o) => o.textContent),
  ).toEqual(["at least", "at most", "exactly"]);
  const box = screen.getByRole("spinbutton", { name: "Number of records" });
  expect(box).toHaveValue(1);
  expect(box).toHaveAttribute("min", "0");
  await userEvent.tab();
  expect(op).toHaveFocus();
  await userEvent.selectOptions(op, "exactly");
  expect(quantity).toEqual({ value: { op: "=", n: 1 }, invalid: false });
  await userEvent.tab();
  expect(box).toHaveFocus();
  await userEvent.keyboard("{Backspace}3");
  expect(quantity).toEqual({ value: { op: "=", n: 3 }, invalid: false });
  expect(box).not.toHaveAttribute("aria-invalid");
});

test("an empty quantity is a draft, never 0", async () => {
  render(<QuantityHarness initial={{ op: ">=", n: 2 }} />);
  const box = screen.getByRole("spinbutton", { name: "Number of records" });
  await userEvent.clear(box);
  expect(quantity).toEqual({ value: { op: ">=", n: null }, invalid: false });
  expect(box).toHaveValue(null);
  expect(box).not.toHaveAttribute("aria-invalid");
});

test.each(["1.5", "-1"])("a quantity of %s is reported invalid and kept as typed", (text) => {
  render(<QuantityHarness initial={{ op: ">=", n: 2 }} />);
  const box = screen.getByRole("spinbutton", { name: "Number of records" });
  fireEvent.change(box, { target: { value: text } });
  expect(quantity).toEqual({ value: { op: ">=", n: null }, invalid: true });
  expect(box).toHaveValue(Number(text));
  expect(box).toHaveAttribute("aria-invalid", "true");
  fireEvent.change(box, { target: { value: "4" } });
  expect(quantity).toEqual({ value: { op: ">=", n: 4 }, invalid: false });
  expect(box).not.toHaveAttribute("aria-invalid");
});

test("an invalid quantity marks both inputs and points at the error", () => {
  render(<QuantityHarness initial={{ op: "<=", n: null }} invalid hiddenLabel />);
  for (const input of [
    screen.getByRole("combobox", { name: "How many" }),
    screen.getByRole("spinbutton", { name: "Number of records" }),
  ]) {
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "err");
  }
  expect(screen.getByText("How many")).toHaveClass("sr-only");
});

test("a quantity takes the caller's operator texts", () => {
  render(
    <QuantityInput
      id="n"
      value={{ op: "=", n: 0 }}
      operatorLabel="How many"
      numberLabel="Number"
      operatorText={{ "=": "precisely" }}
      onChange={vi.fn<(value: Quantity) => void>()}
    />,
  );
  expect(screen.getByRole("combobox", { name: "How many" })).toHaveDisplayValue("precisely");
  expect(screen.getByRole("spinbutton", { name: "Number" })).toHaveValue(0);
});

test("a condition group says in a sentence how its conditions combine", async () => {
  const onOpChange = vi.fn<(op: GroupOp) => void>();
  render(
    <ConditionGroup
      id="op"
      legend="Condition group 1"
      op="AND"
      onOpChange={onOpChange}
      opLabel="How the conditions of Condition group 1 combine"
      before="Match"
      after="these conditions"
      add={<button type="button">Add condition</button>}
      remove={<button type="button">Remove Condition group 1</button>}
    >
      <p>Lives in Berlin</p>
    </ConditionGroup>,
  );
  const group = screen.getByRole("group", { name: "Condition group 1" });
  const select = within(group).getByRole("combobox", {
    name: "How the conditions of Condition group 1 combine",
  });
  expect(select.closest("p")).toHaveTextContent(/^Match\s+.*all of\s*any of\s+these conditions$/);
  expect(
    within(select)
      .getAllByRole("option")
      .map((o) => o.textContent),
  ).toEqual(["all of", "any of"]);
  expect(select).toHaveDisplayValue("all of");
  expect(within(group).getByText("Lives in Berlin")).toBeInTheDocument();
  const buttons = within(group).getAllByRole("button");
  expect(buttons.map((button) => button.textContent)).toEqual([
    "Add condition",
    "Remove Condition group 1",
  ]);
  await userEvent.tab();
  expect(select).toHaveFocus();
  await userEvent.selectOptions(select, "any of");
  expect(onOpChange).toHaveBeenCalledWith("OR");
});

test("a condition group takes the caller's operator texts and invalid state", () => {
  render(
    <ConditionGroup
      id="op"
      legend="Group"
      op="OR"
      onOpChange={vi.fn<(op: GroupOp) => void>()}
      opLabel="Combine"
      before="Kontakte, die"
      after="dieser Bedingungen erfüllen"
      opText={{ AND: "alle", OR: "mindestens eine" }}
      invalid
      describedBy="err"
    >
      {null}
    </ConditionGroup>,
  );
  const select = screen.getByRole("combobox", { name: "Combine" });
  expect(select).toHaveDisplayValue("mindestens eine");
  expect(select).toHaveAttribute("aria-invalid", "true");
  expect(select).toHaveAttribute("aria-describedby", "err");
});

const STEPS: Step[] = [
  { key: "a", label: "Lives in Berlin", count: 120 },
  { key: "b", label: "Gave last year", count: null },
];

test("step counts list each step's count in a polite live region", () => {
  render(<StepCounts label="Step by step" steps={STEPS} countLabel="contacts" />);
  const list = screen.getByRole("list", { name: "Step by step" });
  const rows = within(list).getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent("Lives in Berlin 120 contacts");
  expect(rows[1]).toHaveTextContent("Gave last year Not counted");
  const region = list.parentElement;
  expect(region).toHaveAttribute("aria-live", "polite");
  expect(region).toHaveAttribute("aria-busy", "false");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("busy step counts wait and show a spinner where a count is to come", () => {
  const { rerender, container } = render(
    <StepCounts label="Step by step" steps={[]} countLabel="contacts" busy />,
  );
  const region = container.firstElementChild;
  expect(region).toHaveAttribute("aria-busy", "true");
  expect(screen.getByText("Loading...")).toBeInTheDocument();
  rerender(<StepCounts label="Step by step" steps={STEPS} countLabel="contacts" busy />);
  const rows = within(screen.getByRole("list")).getAllByRole("listitem");
  expect(rows[1]).toHaveTextContent("Loading...");
  expect(rows[1]).not.toHaveTextContent("Not counted");
});

test("a step that failed shows its error and offers to count again", async () => {
  const onRetry = vi.fn<() => void>();
  render(
    <StepCounts
      label="Step by step"
      steps={[...STEPS, { key: "c", label: "Volunteers", count: null, error: "Timeout" }]}
      countLabel="contacts"
      onRetry={onRetry}
    />,
  );
  expect(within(screen.getByRole("list")).getAllByRole("listitem")[2]).toHaveTextContent(
    "Volunteers Error: Timeout",
  );
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(onRetry).toHaveBeenCalledOnce();
});

test("a failed count is announced with its message and a retry button", async () => {
  const onRetry = vi.fn<() => void>();
  render(
    <StepCounts
      label="Step by step"
      steps={[]}
      countLabel="contacts"
      error={Object.assign(new Error("Denied"), { error_message: "Denied" })}
      onRetry={onRetry}
    />,
  );
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("Denied");
  within(alert).getByRole("button", { name: "Try again" }).focus();
  await userEvent.keyboard("{Enter}");
  expect(onRetry).toHaveBeenCalledOnce();
});
