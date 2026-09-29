import type { ReactNode } from "react";
import { LinkContent } from "./LinkContent";
import { Menu } from "./Menu";
import type { DisplaySettings, ToolbarLink } from "./types";

/**
 * crmSearchDisplay/toolbar.html: links as buttons, several links for one action as a dropdown.
 * A task link has no url, so core shows no button for it.
 */
export function Toolbar({ links }: { links: ToolbarLink[] }) {
  return links.map((link, index) =>
    link.children ? (
      <Menu
        key={index}
        buttonClass={`btn btn-${link.style ?? ""} dropdown-toggle`}
        label={<LinkContent link={link} />}
        links={link.children}
        alignRight
      />
    ) : (
      <div className="btn-group" key={index}>
        {link.url && (
          <a href={link.url} className={`btn btn-${link.style ?? ""}`} target={link.target}>
            <LinkContent link={link} />
          </a>
        )}
      </div>
    ),
  );
}

/** crmSearchDisplay/ResultCount.html without a selection, which needs bulk actions. */
export function resultCount(rowCount: number): string {
  return rowCount === 1 ? ts("1 result") : ts("%1 results", { 1: rowCount });
}

interface DisplayHeaderProps {
  settings: DisplaySettings;
  rowCount: number | null;
  toolbar: ToolbarLink[] | undefined;
  /** The search button, first in the bar as in core. */
  button?: ReactNode;
}

/** The description and the form-inline bar above crmSearchDisplayTable's table. */
export function DisplayHeader({ settings, rowCount, toolbar, button }: DisplayHeaderProps) {
  return (
    <>
      {settings.description && (
        <div className="alert alert-info crm-search-display-description">
          {settings.description}
        </div>
      )}
      <div className="form-inline">
        {button && <div className="btn-group">{button}</div>}
        {settings.headerCount && (
          <span>{rowCount !== null && <label>{resultCount(rowCount)}</label>}</span>
        )}
        {settings.toolbar && toolbar && (
          <div className="form-group pull-right">
            <Toolbar links={toolbar} />
          </div>
        )}
      </div>
    </>
  );
}
