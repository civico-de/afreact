import type { ReactNode } from "react";
import { LinkContent } from "./LinkContent";
import { Menu } from "./Menu";
import { resultCount } from "./selection";
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

interface DisplayHeaderProps {
  settings: DisplaySettings;
  rowCount: number | null;
  toolbar: ToolbarLink[] | undefined;
  /** The search button, first in the bar as in core. */
  button?: ReactNode;
  /** The bulk actions menu or buttons, after the search button. */
  actions?: ReactNode;
  selected?: number;
  /** The column picker, last in the bar as in core. */
  picker?: ReactNode;
}

/** The description and the form-inline bar above crmSearchDisplayTable's table. */
export function DisplayHeader({
  settings,
  rowCount,
  toolbar,
  button,
  actions,
  selected = 0,
  picker,
}: DisplayHeaderProps) {
  return (
    <>
      {settings.description && (
        <div className="alert alert-info crm-search-display-description">
          {settings.description}
        </div>
      )}
      <div className="form-inline">
        {button && <div className="btn-group">{button}</div>}
        {actions}
        {settings.headerCount && (
          <span>{rowCount !== null && <label>{resultCount(rowCount, selected)}</label>}</span>
        )}
        {settings.toolbar && toolbar && (
          <div className="form-group pull-right">
            <Toolbar links={toolbar} />
          </div>
        )}
        {picker}
      </div>
    </>
  );
}
