import type { ReactNode } from "react";
import { Select } from "./Select";

export type GroupOp = "AND" | "OR";

interface ConditionGroupProps {
  /** The operator select's id. */
  id: string;
  legend: ReactNode;
  op: GroupOp;
  onOpChange: (op: GroupOp) => void;
  /** Names the operator select, e.g. "How the conditions of group 1 combine". */
  opLabel: string;
  /** The sentence around the select, in the caller's language: "Match" … "these conditions". */
  before: ReactNode;
  after: ReactNode;
  /** The operators' texts; "all of" and "any of" by default. */
  opText?: Partial<Record<GroupOp, string>>;
  /** The conditions. */
  children: ReactNode;
  /** Controls that add to the group, below the conditions. */
  add?: ReactNode;
  /** A control that removes the group, last. */
  remove?: ReactNode;
  className?: string;
  /** Marks the operator select as invalid (`aria-invalid`). */
  invalid?: boolean;
  /** The id of the text that describes the select, such as its error (`aria-describedby`). */
  describedBy?: string;
}

const OPS: GroupOp[] = ["AND", "OR"];
const isOp = (value: unknown): value is GroupOp => OPS.some((op) => op === value);

/** A fieldset of conditions whose first line says how they combine: "Match [all of] these conditions". */
export function ConditionGroup({
  id,
  legend,
  op,
  onOpChange,
  opLabel,
  before,
  after,
  opText = {},
  children,
  add,
  remove,
  className,
  invalid,
  describedBy,
}: ConditionGroupProps) {
  const texts: Record<GroupOp, string> = {
    AND: opText.AND ?? ts("all of"),
    OR: opText.OR ?? ts("any of"),
  };
  return (
    <fieldset className={["afreact-condition-group", className].filter(Boolean).join(" ")}>
      <legend>{legend}</legend>
      <p className="afreact-condition-group-op">
        {before}{" "}
        <Select
          id={id}
          label={opLabel}
          hiddenLabel
          options={OPS.map((key) => ({ id: key, label: texts[key] }))}
          value={op}
          invalid={invalid}
          describedBy={describedBy}
          onChange={(picked) => {
            if (isOp(picked)) onOpChange(picked);
          }}
        />{" "}
        {after}
      </p>
      {children}
      {add !== undefined && <div className="afreact-condition-group-add">{add}</div>}
      {remove !== undefined && <div className="afreact-condition-group-remove">{remove}</div>}
    </fieldset>
  );
}
