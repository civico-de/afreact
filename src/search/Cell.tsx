import { useState, type MouseEvent, type SyntheticEvent } from "react";
import { Unsupported } from "../afform/Unsupported";
import { memoryStore } from "../url/hash";
import { UrlState } from "../url/UrlState";
import { AfreactSearch } from "./AfreactSearch";
import { Icon, LinkContent } from "./LinkContent";
import { Menu } from "./Menu";
import { columnNote } from "./rows";
import {
  isDisplaySettings,
  type CellData,
  type Column,
  type Link,
  type SubsearchDisplay,
} from "./types";

export interface CellProps {
  column: Column | undefined;
  cell: CellData;
  /** Position of the column; core's templates pick some icons by it. */
  colIndex: number;
  /** Subsearch display settings the run sent along. */
  subsearch: Record<string, SubsearchDisplay>;
  afform?: string;
  onLinkClick: (link: Link, event: MouseEvent<HTMLAnchorElement>) => void;
}

/** Angular's interpolation: scalars as text, other objects as JSON. */
export function cellText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

/** The colType templates of crmSearchDisplay, picked as getFieldTemplate() picks them. */
export function Cell(props: CellProps) {
  const { column, cell } = props;
  switch (column?.type) {
    case "field":
      return cell.links ? <FieldLinks {...props} links={cell.links} /> : <FieldValue {...props} />;
    case "html":
      return <HtmlValue value={cell.val} />;
    case "image":
      return <Image cell={cell} />;
    case "links":
      return <LinksColumn {...props} />;
    case "buttons":
      return <ButtonsColumn {...props} />;
    case "menu":
      return <MenuColumn {...props} />;
    case "subsearch":
      return <SubsearchColumn {...props} />;
    default:
      return <Unsupported what={columnNote(column) ?? ""} />;
  }
}

/** colType/field.html; a value with a colour shows as a badge in a contrasting text colour. */
function Value({ value, color }: { value: unknown; color: string | null | undefined }) {
  return color ? (
    <span
      className="crm-search-field-value badge"
      style={{ backgroundColor: color, color: window.CRM.utils.colorContrast(color) }}
    >
      {cellText(value)}
    </span>
  ) : (
    <span className="crm-search-field-value">{cellText(value)}</span>
  );
}

function FieldValue({ cell, colIndex }: CellProps) {
  const left = cell.icons?.left ?? [];
  const right = cell.icons?.right ?? [];
  const colors = cell.colors ?? [];
  if (!Array.isArray(cell.val)) {
    // The single-value template reads the right icon at the column's position, as core does.
    return (
      <span>
        {" "}
        <Icon name={left[0]} /> <Value value={cell.val} color={colors[0]} />{" "}
        <Icon name={right[colIndex]} />{" "}
      </span>
    );
  }
  const values: unknown[] = cell.val;
  return (
    <span>
      {values.map((value, index) => (
        <span key={index}>
          {" "}
          <Icon name={left[index]} />
          <Value value={value} color={colors[index]} />
          <Icon name={right[index]} />
          {index < values.length - 1 && !colors[index] && <span>, </span>}{" "}
        </span>
      ))}
    </span>
  );
}

/** colType/link.html: each value links on its own, comma-separated. */
function FieldLinks({ cell, links, onLinkClick }: CellProps & { links: Link[] }) {
  const left = cell.icons?.left ?? [];
  const right = cell.icons?.right ?? [];
  return links.map((link, index) => (
    <span key={index}>
      <a
        target={link.target}
        href={link.url}
        title={link.title}
        className={link.style}
        aria-disabled={link.task ? true : undefined}
        onClick={(event) => {
          onLinkClick(link, event);
        }}
      >
        {" "}
        <Icon name={left[index]} /> {link.text}
        <Icon name={right[index]} />
      </a>
      {index < links.length - 1 && <span>,</span>}
    </span>
  ));
}

/** colType/html.html: markup the server already ran through CRM_Utils_String::purifyHTML(). */
function HtmlValue({ value }: { value: unknown }) {
  return <span dangerouslySetInnerHTML={{ __html: cellText(value) }} />;
}

function Image({ cell }: { cell: CellData }) {
  const img = cell.img;
  if (!img) return null;
  const image = (
    <img src={img.src} alt={cellText(cell.val)} height={img.height} width={img.width} />
  );
  if (!cell.links) return <span>{image}</span>;
  return (
    <span>
      {cell.links.map((link, index) => (
        <span key={index}>
          <a target={link.target} href={link.url}>
            {image}
          </a>
        </span>
      ))}
    </span>
  );
}

function LinksColumn({ cell, onLinkClick }: CellProps) {
  return (cell.links ?? []).map((link, index) => (
    <span key={index}>
      <a
        className={`text-${link.style ?? ""}`}
        target={link.target}
        href={link.url}
        title={link.title}
        aria-disabled={link.task ? true : undefined}
        onClick={(event) => {
          onLinkClick(link, event);
        }}
      >
        <LinkContent link={link} />
      </a>
    </span>
  ));
}

function ButtonsColumn({ column, cell, onLinkClick }: CellProps) {
  return (cell.links ?? []).map((link, index) => (
    <span key={index}>
      <a
        className={`btn ${column?.size ?? ""} btn-${link.style ?? ""}`}
        target={link.target}
        href={link.url}
        title={link.title}
        aria-disabled={link.task ? true : undefined}
        onClick={(event) => {
          onLinkClick(link, event);
        }}
      >
        <LinkContent link={link} />
      </a>
    </span>
  ));
}

function MenuColumn({ column, cell, onLinkClick }: CellProps) {
  const links = cell.links ?? [];
  if (!links.length) return null;
  return (
    <Menu
      groupRole="group"
      buttonClass={`dropdown-toggle btn ${column?.size ?? ""} btn-${column?.style ?? ""}`}
      label={
        <>
          <Icon name={column?.icon} /> {cell.text}{" "}
        </>
      }
      srLabel={ts("Row Actions")}
      links={links}
      alignRight={column?.alignment === "text-right"}
      itemClass={(link) => `bg-${link.style ?? ""}`}
      onLinkClick={onLinkClick}
    />
  );
}

/** colType/subsearch.html: the nested display loads once its disclosure first opens. */
function SubsearchColumn({ cell, colIndex, subsearch, afform }: CellProps) {
  const [opened, setOpened] = useState(false);
  const info = cell.subsearch;
  if (!info) return null;
  const heading = (
    <>
      {" "}
      <Icon name={cell.icons?.left?.[0]} /> {cellText(cell.val)}{" "}
      <Icon name={cell.icons?.right?.[colIndex]} />{" "}
    </>
  );
  const nested = (
    <NestedDisplay info={info} display={subsearch[info.search_and_display]} afform={afform} />
  );
  if (info.subsearch_mode === "inline") {
    return (
      <div className="crm-search-display-subsearch-inline">
        <div className="crm-search-display-subsearch-inline-header">{heading}</div>
        {nested}
      </div>
    );
  }
  const dropdown = info.subsearch_mode === "dropdown";
  // onToggleDisclosure(): opening a dropdown closes the others of the same display.
  const onToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const details = event.currentTarget;
    if (!details.open) return;
    setOpened(true);
    if (!dropdown) return;
    details
      .closest(".crm-search-display-table")
      ?.querySelectorAll<HTMLDetailsElement>("details.crm-search-display-subsearch-dropdown[open]")
      .forEach((other) => {
        if (other !== details) other.open = false;
      });
  };
  return (
    <details
      className={
        dropdown
          ? "crm-search-display-subsearch-dropdown"
          : "crm-search-display-subsearch-accordion"
      }
      onToggle={onToggle}
    >
      <summary>{heading}</summary>
      <div
        className={
          dropdown
            ? "crm-search-display-subsearch-dropdown-body"
            : "crm-accordion-body crm-search-display-subsearch-accordion-body"
        }
      >
        {opened && nested}
      </div>
    </details>
  );
}

interface NestedDisplayProps {
  info: NonNullable<CellData["subsearch"]>;
  display: SubsearchDisplay | undefined;
  afform?: string;
}

/**
 * crmSearchDisplay picks the display type; without sent settings the display loads its own.
 * Its sort and page stay out of the page's URL, which belongs to the outer display.
 */
function NestedDisplay({ info, display, afform }: NestedDisplayProps) {
  const [store] = useState(() => memoryStore(""));
  if (display && display.type !== "table")
    return <Unsupported what={`subsearch display type ${display.type}`} />;
  const settings = display && isDisplaySettings(display.settings) ? display.settings : undefined;
  return (
    <UrlState store={store} onlyElement>
      <AfreactSearch
        search={info.search}
        display={info.display}
        settings={settings}
        afform={afform}
        filters={info.filters}
      />
    </UrlState>
  );
}
