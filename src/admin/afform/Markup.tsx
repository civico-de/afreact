import { useState, type ReactNode } from "react";
import { errorMessage } from "../../api/civi";
import { Dialog } from "../widgets/Dialog";
import type { AfformDefinition } from "./meta";
import { findElements } from "./model";
import { Monaco } from "./Monaco";
import { convert } from "./save";
import { isShallowNode, withoutMarks, type ShallowNode } from "./tree";
import { crmAlert } from "../../html";

/** isValidLayout(): nodes throughout, and a form's one af-form kept. */
export function validLayout(type: string, layout: unknown): layout is ShallowNode[] {
  if (!Array.isArray(layout) || !layout.length || !layout.every(isShallowNode)) return false;
  return type !== "form" || findElements(layout, (node) => node["#tag"] === "af-form").length === 1;
}

interface MarkupState {
  html: string;
  loading: boolean;
  editing: boolean;
  baseline: string;
}

/**
 * The canvas's Markup tab: the layout as HTML, editable with `edit afform html`. Edits apply to
 * the layout as one undo step, on leaving edit mode, the tab, or on saving.
 */
export function useMarkup(afform: AfformDefinition, apply: (layout: ShallowNode[]) => void) {
  const [tab, setTab] = useState<"layout" | "markup">("layout");
  const [state, setState] = useState<MarkupState>({
    html: "",
    loading: false,
    editing: false,
    baseline: "",
  });
  const [asking, setAsking] = useState<((applied: boolean) => void) | null>(null);
  const unapplied = state.editing && state.html !== state.baseline;

  const refresh = () => {
    setState((current) => ({ ...current, loading: true }));
    convert(withoutMarks(afform.layout), "shallow", "html")
      .then((html) => {
        if (typeof html !== "string") throw new Error("Afform.convert returned no HTML.");
        setState((current) => ({ ...current, html, loading: false }));
      })
      .catch((failure: unknown) => {
        setState((current) => ({ ...current, loading: false }));
        crmAlert(errorMessage(failure), ts("Error"), "error");
      });
  };

  /** applyMarkupToLayout(): the layout the HTML became, or null where it could not. */
  const applyHtml = (): Promise<ShallowNode[] | null> =>
    // deviation:markup-keeps-ts-calls
    convert(state.html, "html", "shallow").then(
      (layout) => {
        if (!validLayout(afform.type, layout)) {
          crmAlert(
            ts("The markup could not be applied because it produced an invalid layout structure."),
            ts("Invalid markup"),
            "error",
          );
          return null;
        }
        apply(layout);
        setState((current) => ({ ...current, editing: false }));
        return layout;
      },
      (failure: unknown) => {
        crmAlert(errorMessage(failure), ts("Could not apply markup"), "error");
        return null;
      },
    );

  /** resolvePendingMarkupEdits(): asks to apply or discard, then `next` runs unless cancelled. */
  const resolvePending = (next: () => void) => {
    setAsking(() => (applied: boolean) => {
      if (applied) next();
    });
  };

  const showLayout = () => {
    if (!unapplied) {
      setState((current) => ({ ...current, editing: false }));
      setTab("layout");
    } else
      resolvePending(() => {
        setTab("layout");
      });
  };

  const showMarkup = () => {
    setTab("markup");
    if (!state.editing) refresh();
  };

  const toggleEdit = () => {
    if (!state.editing)
      setState((current) => ({ ...current, baseline: current.html, editing: true }));
    else if (!unapplied) setState((current) => ({ ...current, editing: false }));
    else resolvePending(() => undefined);
  };

  const dialog: ReactNode = asking && (
    <Dialog
      title={ts("Unsaved markup changes")}
      onClose={() => {
        setAsking(null);
      }}
      buttons={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setState((current) => ({ ...current, html: current.baseline, editing: false }));
              setAsking(null);
              asking(true);
            }}
          >
            {ts("Discard changes")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setAsking(null);
              void applyHtml().then((layout) => {
                asking(layout !== null);
              });
            }}
          >
            {ts("Apply changes")}
          </button>
        </>
      }
    >
      <p>
        {ts(
          "You have made changes to the markup. Apply them to the layout, or discard them, before continuing.",
        )}
      </p>
    </Dialog>
  );

  const panel = (
    <>
      <div className="af-gui-markup-controls">
        {window.CRM.checkPerm("edit afform html") && (
          <div className="crm-form-toggle-container pull-right">
            <input
              type="checkbox"
              className="crm-form-toggle"
              aria-label={ts("Edit raw markup")}
              title={ts("Edit raw markup")}
              checked={state.editing}
              disabled={state.loading}
              onChange={toggleEdit}
            />
            <span className="crm-form-toggle-text crm-form-toggle-text-off" aria-hidden="true">
              {ts("View")}
            </span>
            <span className="crm-form-toggle-text crm-form-toggle-text-on" aria-hidden="true">
              {ts("Edit")}
            </span>
          </div>
        )}
        <p className="help-block">
          {state.editing
            ? ts(
                "Editing raw markup. Click Save to apply your changes, or turn off editing to discard them.",
              )
            : ts("This is a read-only preview of the auto-generated markup.")}
        </p>
      </div>
      {state.loading ? (
        <p role="status">{ts("Loading…")}</p>
      ) : (
        <Monaco
          value={state.html}
          editable={state.editing}
          label={ts("Markup")}
          onChange={(html) => {
            setState((current) => ({ ...current, html }));
          }}
        />
      )}
    </>
  );

  return {
    tab,
    editing: state.editing,
    unapplied,
    showLayout,
    showMarkup,
    /** Undo and redo show the layout they changed. */
    forceLayout: () => {
      setTab("layout");
    },
    applyHtml,
    panel,
    dialog,
  };
}
