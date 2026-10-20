declare module "@bcoe/v8-coverage" {
  import type { Profiler } from "node:inspector";
  /** Merges the coverage of scripts with the same URL across processes. */
  export function mergeProcessCovs(processCovs: { result: Profiler.ScriptCoverage[] }[]): {
    result: Profiler.ScriptCoverage[];
  };
}
