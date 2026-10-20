/**
 * A count in a badge; `label` names what is counted for screen readers, `null` while counting.
 * It announces nothing itself: a count that changes in view sits in the caller's live region.
 */
export function CountBadge({ count, label }: { count: number | null; label: string }) {
  if (count === null)
    return (
      <span className="badge" aria-busy="true">
        <i className="crm-i fa-spinner fa-pulse" aria-hidden="true" />
        <span className="sr-only">{ts("Loading...")}</span>
      </span>
    );
  return (
    <span className="badge">
      {count}
      <span className="sr-only"> {label}</span>
    </span>
  );
}
