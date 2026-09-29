import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

// CiviCRM's globals: ts() fills %1-style placeholders, CRM.api4 is replaced per test.
globalThis.ts = (text, params = {}) =>
  text.replace(/%(\d+)/g, (match, key: string) => (key in params ? String(params[key]) : match));
window.CRM = { api4: vi.fn(), url: (path) => `/${path}` };

afterEach(() => {
  vi.mocked(window.CRM.api4).mockReset();
});
