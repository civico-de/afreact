/**
 * jsdom lacks the modal dialog: showModal/close with the `open` attribute, the close event, and
 * Escape firing a cancelable cancel event. Focus trapping and the inert page are the browser's part.
 */
export function installDialog() {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
    // The dialog focusing steps: the first focusable element inside.
    this.querySelector<HTMLElement>("[autofocus], button:not(:disabled), [href], input")?.focus();
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  document.addEventListener("keydown", (event) => {
    const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
    if (event.key !== "Escape" || !dialog) return;
    const cancel = new Event("cancel", { cancelable: true });
    if (dialog.dispatchEvent(cancel)) dialog.close();
  });
}
