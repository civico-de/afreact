/** CRM.alert() and CRM.status() take HTML; text shown through them is escaped first. */
// deviation:alert-text-escaped
export function asHtml(text: string): string {
  const element = document.createElement("div");
  element.textContent = text;
  return element.innerHTML;
}
