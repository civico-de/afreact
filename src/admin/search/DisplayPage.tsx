import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api4, errorMessage } from "../../api/civi";
import { replacePageTitle } from "../../afform/pageTitle";
import { AfreactSearch, useSearchDisplay } from "../../search/AfreactSearch";
import { Menu } from "../../search/Menu";
import { displayKeys } from "../../search/urlKeys";
import { useHashParams } from "../../url/UrlState";

interface PageSearch {
  id: number;
  name: string;
  checkAccess: { access: boolean };
}

const OWN_KEYS: string[] = Object.values(displayKeys(""));

/** crmSearchPageDisplay: a display, or the search's default one, with an edit link for editors. */
export function DisplayPage({ search, display }: { search: string; display: string | null }) {
  const host = useRef<HTMLDivElement>(null);
  const saved = useQuery({
    queryKey: ["SavedSearch", "page", search],
    queryFn: async () => {
      const [found] = await api4<PageSearch>("SavedSearch", "get", {
        select: ["id", "name"],
        where: [["name", "=", search]],
        chain: {
          checkAccess: [
            "SavedSearch",
            "checkAccess",
            { action: "update", values: { id: "$id" } },
            0,
          ],
        },
      });
      if (!found) throw new Error(ts("Saved search %1 not found.", { 1: search }));
      return found;
    },
  });
  const loaded = useSearchDisplay(search, display, true);
  const params = useHashParams();
  const filters = Object.fromEntries([...params].filter(([key]) => !OWN_KEYS.includes(key)));

  // The heading follows once the page, and with it the host element, renders.
  const label = saved.data ? loaded.data?.label : undefined;
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!label || !host.current) return;
    const heading = document.querySelector(".crm-page-title-wrapper>h1, h1.crm-page-title, h1");
    const from = shown.current ?? heading?.textContent.trim() ?? "";
    replacePageTitle(host.current, from, label);
    shown.current = label;
  }, [label]);

  const error = saved.error ?? loaded.error;
  if (error)
    return (
      <p className="crm-error" role="alert">
        {errorMessage(error)}
      </p>
    );
  if (!loaded.data || !saved.data) return <p role="status">{ts("Loading…")}</p>;
  return (
    <div ref={host} className="crm-search-display-page">
      <AfreactSearch
        search={search}
        display={display}
        type={loaded.data.type}
        settings={loaded.data.settings}
        filters={filters}
      />
      {saved.data.checkAccess.access && (
        <Menu
          groupClass="btn-group dropup crm-admin-block-context-dropdown"
          buttonClass="btn dropdown-toggle btn-sm"
          label={<i className="crm-i fa-gear" role="img" aria-hidden="true" />}
          srLabel={ts("Configure")}
          alignRight
          links={[
            {
              url: window.CRM.url(`civicrm/admin/search#/edit/${String(saved.data.id)}`),
              text: ts("Edit in SearchKit"),
              icon: "fa-pencil",
            },
          ]}
        />
      )}
    </div>
  );
}
