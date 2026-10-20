import type { Link } from "./types";

/** An icon, as SearchKit's templates write it. */
export function Icon({ name }: { name: string | null | undefined }) {
  return name ? <i className={`crm-i ${name}`} role="img" aria-hidden="true" /> : null;
}

/** Icon and text of a menu, button, links or toolbar link, spaced as core's templates. */
export function LinkContent({ link }: { link: Link }) {
  return (
    <>
      <Icon name={link.icon} /> {link.content ?? link.text}{" "}
    </>
  );
}

// deviation:link-title-names-link
/** A title other than the text names the link; one lacking the visible text follows that text. */
export function linkLabel(link: Link): string | undefined {
  const title = link.title?.trim() ?? "";
  const text = link.text?.trim() ?? "";
  if (!title || title === text) return undefined;
  return title.toLocaleLowerCase().includes(text.toLocaleLowerCase()) ? title : `${text}: ${title}`;
}
