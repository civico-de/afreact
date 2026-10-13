import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * On unmount, focus goes back to the element focused at open, or, when that sat in a popover menu
 * that is gone, to the menu's button. `deviation:dialog-return-focus`
 */
export function useReturnFocus() {
  useEffect(() => {
    const opener = document.activeElement;
    const menuId = opener?.closest("[popover]")?.id;
    const menuButton = [...document.querySelectorAll("[popovertarget]")].find(
      (button) => menuId && button.getAttribute("popovertarget") === menuId,
    );
    return () => {
      const target = opener?.isConnected ? opener : menuButton;
      if (target instanceof HTMLElement && target.isConnected) target.focus();
    };
  }, []);
}

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
  useReturnFocus();
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
