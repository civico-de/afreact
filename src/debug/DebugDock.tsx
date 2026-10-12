import { useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { debugEntries, debugSections, subscribeDebug } from "./debug";

const PANEL_ID = "afreact-debug-panel";

/** The floating debug button and its panel, listing what the page's forms and builders add. */
export function DebugDock() {
  const entries = useSyncExternalStore(subscribeDebug, debugEntries);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  if (!entries.length) return null;
  return (
    <div
      className="afreact-debug-dock"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        setOpen(false);
        button.current?.focus();
      }}
    >
      <button
        ref={button}
        type="button"
        className="btn btn-primary afreact-debug-toggle"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <i className="crm-i fa-bug" role="img" aria-hidden="true" /> {ts("Debug")}
      </button>
      {/* After its button, so Tab goes on into it; the dock's CSS shows it above. */}
      {open && (
        <section
          id={PANEL_ID}
          className="afreact-debug-panel"
          aria-labelledby="afreact-debug-title"
          // The panel scrolls, so the keyboard reaches it too.
          tabIndex={0}
        >
          <h2 id="afreact-debug-title">{ts("React renderer debug")}</h2>
          {debugSections(entries).map(({ title, facts, links }) => (
            <section key={title} aria-label={title}>
              <h3>{title}</h3>
              {links.length > 0 && (
                <p className="afreact-debug-links">
                  {links.map((link) => (
                    <a
                      key={`${link.label} ${link.href}`}
                      className="btn btn-secondary"
                      href={link.href}
                    >
                      {link.label}
                    </a>
                  ))}
                </p>
              )}
              <dl>
                {facts.map(([label, values]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      {values.length === 0 ? (
                        ts("None")
                      ) : values.length === 1 ? (
                        <code>{values[0]}</code>
                      ) : (
                        <ul>
                          {values.map((value) => (
                            <li key={value}>
                              <code>{value}</code>
                            </li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </section>
      )}
    </div>
  );
}

let mounted = false;

/** Mounts the dock once per page, in a container of its own so the theme styles it. */
export function mountDebugDock() {
  if (mounted) return;
  mounted = true;
  const host = document.createElement("div");
  host.className = "crm-container afreact-debug-host";
  document.body.append(host);
  createRoot(host).render(<DebugDock />);
}
