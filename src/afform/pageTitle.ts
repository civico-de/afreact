const DIALOG = ".ui-dialog-content";

/** afCore's addTitle(): the labels of a search's filters go before the form's title. */
export function titleWithLabels(title: string, labels: string[]): string {
  return [...labels, title].filter(Boolean).join(" ");
}

/**
 * crmPageTitle as core's Afform page uses it: a popup's title, or else the document title and
 * the page heading that still read `from`.
 */
export function replacePageTitle(element: Element, from: string, to: string): void {
  const dialog = window.CRM.$(element).closest(DIALOG);
  if (dialog.length) {
    dialog.dialog("option", "title", to);
    return;
  }
  document.title = document.title.replace(from, to);
  for (const heading of document.querySelectorAll(
    "h1:not(.crm-container h1), .crm-page-title-wrapper>h1",
  )) {
    if (heading.classList.contains("crm-page-title") || heading.textContent.trim() === from) {
      heading.classList.add("crm-page-title");
      heading.textContent = to;
    }
  }
}
