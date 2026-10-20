import type { ReactNode } from "react";
import { errorMessage } from "../api/civi";
import { CountBadge } from "./CountBadge";
import { Notice } from "./Notice";

export interface Step {
  /** Identifies the step among the others, e.g. its path. */
  key: string;
  label: ReactNode;
  /** What remains after the step; `null` when it was not counted. */
  count: number | null;
  /** Why this step could not be counted. */
  error?: string;
}

interface StepCountsProps {
  /** Names the list, e.g. "Step by step". */
  label: string;
  steps: Step[];
  /** Names what is counted for screen readers, e.g. "contacts". */
  countLabel: string;
  /** While counting: the list is `aria-busy` and steps without a count show a spinner. */
  busy?: boolean;
  /** The request for all steps failed. */
  error?: unknown;
  /** Counts again; a "Try again" button shows with any error. */
  onRetry?: () => void;
}

function StepCount({ step, busy, countLabel }: { step: Step; busy: boolean; countLabel: string }) {
  if (step.error !== undefined)
    return (
      <span className="afreact-step-error">
        <i className="crm-i fa-exclamation-triangle" aria-hidden="true" /> {ts("Error")}:{" "}
        {step.error}
      </span>
    );
  if (step.count === null && !busy)
    return <span className="afreact-step-uncounted description">{ts("Not counted")}</span>;
  return <CountBadge count={step.count} label={countLabel} />;
}

/** How many remain after each step, in a polite live region that waits while it is busy. */
export function StepCounts({
  label,
  steps,
  countLabel,
  busy = false,
  error,
  onRetry,
}: StepCountsProps) {
  const failed = error !== undefined && error !== null;
  const retry = onRetry && (failed || steps.some((step) => step.error !== undefined)) && (
    <button type="button" className="btn btn-xs btn-secondary" onClick={onRetry}>
      <i className="crm-i fa-refresh" aria-hidden="true" /> {ts("Try again")}
    </button>
  );
  return (
    <div className="afreact-step-counts" aria-live="polite" aria-busy={busy}>
      {busy && steps.length === 0 && <CountBadge count={null} label={countLabel} />}
      {steps.length > 0 && (
        <ol className="afreact-steps" aria-label={label}>
          {steps.map((step) => (
            <li key={step.key}>
              <span className="afreact-step-label">{step.label}</span>{" "}
              <StepCount step={step} busy={busy} countLabel={countLabel} />
            </li>
          ))}
        </ol>
      )}
      {failed && (
        <Notice type="error">
          {errorMessage(error)} {retry}
        </Notice>
      )}
      {!failed && retry}
    </div>
  );
}
