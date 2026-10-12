import { useDebugFacts } from "../debug/debug";

/** Visible marker for layout the React renderer cannot reproduce yet; never dropped silently. */
export function Unsupported({ what }: { what: string }) {
  useDebugFacts({ [ts("Not supported by the React renderer")]: [what] });
  return (
    <p className="afreact-unsupported" role="note">
      {ts("Not supported by the React renderer: %1", { 1: what })}
    </p>
  );
}
