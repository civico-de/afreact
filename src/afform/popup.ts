/**
 * How afCore behaves inside a CRM.loadForm popup (a jQuery UI dialog): route parameters come
 * from the URL the dialog loaded, and a saved form announces itself and closes the dialog.
 */

const DIALOG = ".ui-dialog-content";

/** afCoreDirective's routeParams in a popup: only the query after "?" in the dialog's urlHash. */
export function popupLocation(element: Element): { search: string; hash: string } | null {
  if (!element.closest(DIALOG)) return null;
  const urlHash = window.CRM.$(element).closest(DIALOG).data("urlHash");
  const query =
    typeof urlHash === "string" && urlHash.includes("?")
      ? urlHash.slice(urlHash.indexOf("?") + 1)
      : "";
  return { search: "", hash: query ? `#?${query}` : "" };
}

/** afForm's postProcess: crmFormSuccess on the form, then a popup closes unless a message follows. */
export function announceSaved(element: Element, detail: unknown, closePopup: boolean): void {
  const form = window.CRM.$(element);
  form.trigger("crmFormSuccess", detail);
  const dialog = form.closest(DIALOG);
  if (closePopup && dialog.length) dialog.dialog("close");
}
