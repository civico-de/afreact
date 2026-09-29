import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { events } from "./jquery";
import { installPopover } from "./popover";

// CiviCRM's globals: ts() fills %1-style placeholders, CRM.api4 is replaced per test.
globalThis.ts = (text, params = {}) =>
  text.replace(/%(\d+)/g, (match, key: string) => (key in params ? String(params[key]) : match));
// CRM.$ stands for jQuery outside a popup; tests replace it per call with vi.mocked().
const $ = (target: Element) => events(target);
window.CRM = {
  api4: vi.fn(),
  url: (path) => `/${path}`,
  $: vi.fn($),
  loadForm: vi.fn(() => events(new EventTarget())),
  utils: { colorContrast: () => "white" },
};
installPopover();

afterEach(() => {
  vi.mocked(window.CRM.api4).mockReset();
  vi.mocked(window.CRM.$).mockReset().mockImplementation($);
});
