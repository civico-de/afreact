import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { events } from "./jquery";
import { installDialog } from "./dialog";
import { installIntersectionObserver } from "./intersection";
import { animate, installMotion } from "./motion";
import { installPopover } from "./popover";
import { installResizeObserver } from "./resize";

// CiviCRM's globals: ts() fills %1-style placeholders and picks `plural` for a `count` other
// than 1, as Common.js does; CRM.api4 is replaced per test.
globalThis.ts = (text, params = {}) => {
  const { plural, count } = params;
  const form = typeof plural === "string" && count !== 1 ? plural : text;
  return form
    .replace(/%count/g, String(count))
    .replace(/%(\d+)/g, (match, key: string) => (key in params ? String(params[key]) : match));
};
// CRM.$ stands for jQuery outside a popup; tests replace it per call with vi.mocked().
const $ = (target: Element) => events(target);
window.CRM = {
  api4: vi.fn(),
  url: (path) => `/${path}`,
  checkPerm: vi.fn(() => false),
  $: vi.fn($),
  loadForm: vi.fn(() => events(new EventTarget())),
  status: vi.fn(() => ({ resolve: vi.fn(), reject: vi.fn() })),
  alert: vi.fn(),
  utils: {
    colorContrast: () => "white",
    formatDate: (input, _format, time) => `${String(input)} as ${time ? "date and time" : "date"}`,
    munge: (name, char = "_", len = 63) =>
      name
        .trim()
        .replace(/[^a-zA-Z0-9]+/g, char)
        .substring(0, len),
  },
};
installMotion();
installPopover();
installDialog();
installIntersectionObserver();
installResizeObserver();

afterEach(() => {
  vi.mocked(window.CRM.api4).mockReset();
  vi.mocked(window.CRM.checkPerm).mockReset().mockReturnValue(false);
  vi.mocked(window.CRM.$).mockReset().mockImplementation($);
  vi.mocked(window.CRM.alert).mockClear();
  vi.mocked(window.CRM.status).mockClear();
  animate.mockClear();
});
