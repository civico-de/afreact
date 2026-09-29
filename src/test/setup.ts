import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { installPopover } from "./popover";

// CiviCRM's globals: ts() fills %1-style placeholders, CRM.api4 is replaced per test.
globalThis.ts = (text, params = {}) =>
  text.replace(/%(\d+)/g, (match, key: string) => (key in params ? String(params[key]) : match));
// jQuery events stand in as DOM events, so a test fires crmPopupFormSuccess with dispatchEvent.
function events(target: EventTarget) {
  const handlers = {
    on: (names: string, handler: () => void) => {
      for (const name of names.split(" ")) target.addEventListener(name, handler);
      return handlers;
    },
    off: (names: string, handler: () => void) => {
      for (const name of names.split(" ")) target.removeEventListener(name, handler);
      return handlers;
    },
    data: (): unknown => undefined,
  };
  return handlers;
}
window.CRM = {
  api4: vi.fn(),
  url: (path) => `/${path}`,
  $: events,
  loadForm: vi.fn(() => events(new EventTarget())),
  utils: { colorContrast: () => "white" },
};
installPopover();

afterEach(() => {
  vi.mocked(window.CRM.api4).mockReset();
});
