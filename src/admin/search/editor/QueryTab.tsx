import type { ApiParams } from "../expr";
import type { RunDebug } from "../../../search/types";

interface QueryTabProps {
  params: ApiParams;
  debug: RunDebug | null;
}

/** crmSearch-query: the API parameters, the last run's time and, for debug users, its SQL. */
export function QueryTab({ params, debug }: QueryTabProps) {
  return (
    <>
      <div>
        <strong>API:</strong>
      </div>
      <pre>{JSON.stringify(params, null, 2)}</pre>
      {debug?.timeIndex !== undefined && (
        <pre>{ts("Request took %1 seconds.", { 1: debug.timeIndex })}</pre>
      )}
      {window.CRM.checkPerm("view debug output") && (
        <div>
          <strong>SQL:</strong>
          {debug?.sql ? (
            debug.sql.map((query, index) => <pre key={index}>{query}</pre>)
          ) : (
            <pre>{ts("Run search to view SQL")}</pre>
          )}
        </div>
      )}
    </>
  );
}
