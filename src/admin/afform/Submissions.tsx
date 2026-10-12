import { useQuery } from "@tanstack/react-query";
import { api4, errorMessage } from "../../api/civi";
import { AfreactSearch } from "../../search/AfreactSearch";
import { isDisplaySettings } from "../../search/types";

const SEARCH = "AfAdmin_Submission_List";

/** CRM_AfformAdmin_Page_Submissions: a form's submissions in the default display core builds for it. */
export function Submissions({ name }: { name: string | null }) {
  const filters = { afformName: name };
  const display = useQuery({
    queryKey: ["SearchDisplay", "getDefault", SEARCH, name],
    queryFn: async () => {
      const forms = await api4("Afform", "get", { where: [["name", "=", name]], select: ["name"] });
      // deviation:unknown-form-submissions
      if (!forms.length)
        throw new Error(ts("No form %1 exists that you may see.", { 1: name ?? "" }));
      const [found] = await api4<{ settings?: unknown }>("SearchDisplay", "getDefault", {
        savedSearch: SEARCH,
        type: "table",
        context: { filters },
        select: ["settings"],
      });
      if (!isDisplaySettings(found?.settings))
        throw new Error(ts("Search display %1 has no columns.", { 1: SEARCH }));
      return found.settings;
    },
    enabled: !!name,
  });
  const error = !name ? new Error(ts("The address names no form.")) : display.error;
  if (error)
    return (
      <p className="crm-error" role="alert">
        {errorMessage(error)}
      </p>
    );
  if (!display.data) return <p role="status">{ts("Loading…")}</p>;
  return (
    <AfreactSearch
      search={SEARCH}
      display={null}
      type="table"
      settings={display.data}
      filters={filters}
    />
  );
}
