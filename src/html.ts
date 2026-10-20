type AlertType = "alert" | "success" | "info" | "error" | "warning";

function asHtml(text: string): string {
  const element = document.createElement("div");
  element.textContent = text;
  return element.innerHTML;
}

/** CRM.alert() with plain text: a notification takes its text and title as HTML, the fallback dialog as text. */
// deviation:alert-text-escaped
export function crmAlert(text: string, title?: string, type?: AlertType): unknown {
  const html = document.getElementById("crm-notification-container") !== null;
  return window.CRM.alert(html ? asHtml(text) : text, html && title ? asHtml(title) : title, type);
}
