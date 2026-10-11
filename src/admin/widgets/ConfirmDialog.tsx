import { useEffect, useId, useRef, type ReactNode } from "react";

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** Blocks the confirm button, as CRM.confirm's block() while its message loads. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** CRM.confirm as a native modal dialog: Escape and Cancel close it, focus returns to the opener. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  });
  return (
    <dialog
      ref={dialog}
      className="afreact-dialog"
      aria-labelledby={titleId}
      aria-busy={busy}
      onClose={onCancel}
    >
      <h2 id={titleId} className="afreact-dialog-title">
        {title}
      </h2>
      <div className="afreact-dialog-body">{children}</div>
      <div className="afreact-dialog-buttons">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          {ts("Cancel")}
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
