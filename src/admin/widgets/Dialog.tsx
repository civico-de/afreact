import { useEffect, useId, useRef, type ReactNode } from "react";

/** crm-dialog as a native modal dialog: Escape closes it, focus returns to the opener. */
export function Dialog({
  title,
  wide = false,
  className,
  buttons,
  onClose,
  children,
}: {
  title: string;
  wide?: boolean;
  className?: string;
  /** The buttons beside Cancel. */
  buttons: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  });
  const classes = ["afreact-dialog", wide && "afreact-dialog-wide", className].filter(Boolean);
  return (
    <dialog ref={dialog} className={classes.join(" ")} aria-labelledby={titleId} onClose={onClose}>
      <h2 id={titleId} className="afreact-dialog-title">
        {title}
      </h2>
      <div className="afreact-dialog-body">{children}</div>
      <div className="afreact-dialog-buttons">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {ts("Cancel")}
        </button>
        {buttons}
      </div>
    </dialog>
  );
}
