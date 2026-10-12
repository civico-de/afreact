import type { ReactNode } from "react";

type Data = Record<string, unknown>;

const texts = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

/** ~/afAdmin/afListPlacementColumn.html: a form's page route and the places it shows. */
function PlacementColumn({ data }: { data: Data }) {
  const route = typeof data.server_route === "string" ? data.server_route : "";
  const icons = texts(data["placement:icon"]);
  return (
    <ul className="list-unstyled">
      {route && (
        <li>
          <a
            href={window.CRM.url(route, undefined, data.is_public ? "front" : "back")}
            target="_blank"
          >
            <i className="crm-i fa-external-link" role="img" aria-hidden="true" /> {route}
          </a>
        </li>
      )}
      {texts(data["placement:label"]).map((label, index) => (
        <li key={index}>
          <i className={`crm-i ${text(icons[index]) || "fa-cog"}`} role="img" aria-hidden="true" />{" "}
          {text(label)}
        </li>
      ))}
    </ul>
  );
}

/** Core's own include templates of search display columns, each rendered from the row's values. */
export const INCLUDES: Record<string, (data: Data) => ReactNode> = {
  "~/afAdmin/afListPlacementColumn.html": (data) => <PlacementColumn data={data} />,
};
