import { onTestFinished } from "vitest";

/** The notification container CiviCRM screens have, for the rest of the test. */
export function onCiviScreen(): void {
  const container = document.body.appendChild(document.createElement("div"));
  container.id = "crm-notification-container";
  onTestFinished(() => {
    container.remove();
  });
}
