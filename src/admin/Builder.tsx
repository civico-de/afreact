import { Fragment, type ReactNode } from "react";
import { ClassicContext } from "./classic";
import { firstMatch, LeaveGuardContext, useGuardedHashPath, type Pattern } from "./route";

export type BuilderName = "search_kit" | "afform";

/** A screen of a builder: its hash route and what it renders with the route's values. */
export interface Screen {
  pattern: Pattern;
  render: (params: Record<string, string>) => ReactNode;
}

/** The screens per core route; a route without a matching screen opens in the classic builder. */
export type Screens = Record<string, Record<string, Screen>>;

/** Each core route's screen for the bare hash, as core's routers redirect it. */
export const DEFAULT_PATH: Record<string, Pattern> = {
  "civicrm/admin/search": "/list",
  "civicrm/admin/afform": "/",
};

interface BuilderProps {
  route: string;
  /** The classic builder's address, without hash. */
  classic: string;
  screens: Screens;
}

/** A React builder page: the screen for the hash, and a link to the same screen in core's builder. */
export function Builder({ route, classic, screens }: BuilderProps) {
  const { path: hashPath, setGuard } = useGuardedHashPath();
  // Core's routers read `#create/…` as `#/create/…`.
  const path =
    hashPath === ""
      ? (DEFAULT_PATH[route] ?? "/")
      : hashPath.startsWith("/")
        ? hashPath
        : `/${hashPath}`;
  const routed = screens[route] ?? {};
  const match = firstMatch(
    Object.fromEntries(Object.entries(routed).map(([name, screen]) => [name, screen.pattern])),
    path,
  );
  const classicHere = `${classic}${window.location.hash}`;
  return (
    <div className="afreact-builder">
      <p className="afreact-builder-classic">
        <a href={classicHere}>
          <i className="crm-i fa-external-link" role="img" aria-hidden="true" />{" "}
          {ts("Open in the classic builder")}
        </a>
      </p>
      {match ? (
        <ClassicContext value={classic}>
          <LeaveGuardContext value={setGuard}>
            {/* A new route is a new screen, so no state carries over between them. */}
            <Fragment key={path}>{routed[match.name]?.render(match.params) ?? null}</Fragment>
          </LeaveGuardContext>
        </ClassicContext>
      ) : (
        <div className="messages status no-popup" role="status">
          <i className="crm-i fa-info-circle" role="img" aria-hidden="true" />{" "}
          {ts("This screen is not available in the React builder yet.")}{" "}
          <a href={classicHere}>{ts("Open it in the classic builder.")}</a>
        </div>
      )}
    </div>
  );
}
