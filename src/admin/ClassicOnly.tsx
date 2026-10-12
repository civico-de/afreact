/** The changes other extensions make to core's builder that React does not run, which stop saving. */
export function ClassicOnly({
  changes,
  message,
  link,
  linkText,
}: {
  changes: string[];
  message: string;
  link: string;
  linkText: string;
}) {
  if (!changes.length) return null;
  return (
    <div className="messages warning no-popup" role="status">
      <i className="crm-i fa-exclamation-triangle" role="img" aria-hidden="true" /> {message}{" "}
      <a href={link}>{linkText}</a>
      <ul>
        {changes.map((change) => (
          <li key={change}>
            <code>{change}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
