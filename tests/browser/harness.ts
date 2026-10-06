import AxeBuilder from "@axe-core/playwright";
import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { asRows } from "../../src/api/civi";
import { isReady } from "../../src/compare/metrics";

export const AUTH = "tests/browser/.auth/admin.json";

/** Sets debug_enabled and returns the previous value. */
export async function setDebug(browser: Browser, value: unknown): Promise<unknown> {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto("/civicrm/afreact/compare");
  const [previous] = await api<{ value: unknown }>(page, "Setting", "get", {
    select: ["debug_enabled"],
  });
  await api(page, "Setting", "set", { values: { debug_enabled: value } });
  await context.close();
  return previous?.value;
}

/** Waits for isReady(), evaluated in the page so the time is on the page's own clock. */
export async function readyAt(page: Page): Promise<number> {
  const ready = await page.waitForFunction(
    `(${isReady.toString()})(document) && performance.now()`,
    undefined,
    { polling: "raf", timeout: 30_000 },
  );
  const ms: unknown = await ready.jsonValue();
  if (typeof ms !== "number") throw new Error(`isReady() stamped ${String(ms)}, not a time`);
  return ms;
}

export type Renderer = "react" | "angular";
export const PAGES: Record<Renderer, string> = {
  react: "/civicrm/afreact/demo",
  angular: "/civicrm/afreact/angular",
};

/** Operates a demo form field; Angular uses select2 and the jQuery datepicker, React native inputs. */
export interface Driver {
  field(name: string): Locator;
  fill(name: string, value: string): Promise<void>;
  select(name: string, label: string): Promise<void>;
  date(name: string, isoDate: string): Promise<void>;
  selected(name: string): Promise<string>;
}

export function driver(page: Page, renderer: Renderer): Driver {
  const form = page.locator(".afreact-demo section").first();
  const field = (name: string) => form.locator(`af-field[name="${name}"]`).first();
  return {
    field,
    fill: (name, value) => field(name).locator("input, textarea").first().fill(value),
    async select(name, label) {
      if (renderer === "react") {
        await field(name).locator("select").selectOption({ label });
        return;
      }
      await field(name).locator(".select2-choice").click();
      await page
        .locator(".select2-drop-active .select2-result-label", { hasText: label })
        .first()
        .click();
    },
    async date(name, isoDate) {
      if (renderer === "react") {
        await field(name).locator("input").fill(isoDate);
        return;
      }
      // The datepicker's visible input takes the site's input format (mm/dd/yy by default).
      const [year, month, day] = isoDate.split("-");
      const input = field(name).locator("input:visible").first();
      await input.fill(`${month}/${day}/${year}`);
      await input.press("Escape");
      await input.blur();
      await expect(
        field(name).locator("input[type=hidden], input:not(:visible)").first(),
      ).toHaveValue(isoDate);
    },
    async selected(name) {
      if (renderer === "react") {
        return field(name)
          .locator("select")
          .evaluate((select: HTMLSelectElement) => select.selectedOptions[0]?.text ?? "");
      }
      return (await field(name).locator(".select2-chosen").innerText()).trim();
    },
  };
}

export async function api<T>(
  page: Page,
  entity: string,
  action: string,
  params: object,
): Promise<T[]> {
  // CRM.url's templates come from an inline script late in the page; CRM.api4 needs them.
  await page.waitForFunction(() => {
    try {
      return typeof window.CRM.url("civicrm/ajax/api4") === "string";
    } catch {
      return false;
    }
  });
  return asRows<T>(
    await page.evaluate(([e, a, p]) => window.CRM.api4(e, a, p), [entity, action, params] as const),
    `${entity}.${action}`,
  );
}

/**
 * APIv4 over HTTP with the page's session, the page parked on about:blank. For writes that rebuild
 * civicrm_menu: a page request starting mid-rebuild would start a second one past the response.
 */
export async function quietApi<T>(
  page: Page,
  entity: string,
  action: string,
  params: object,
): Promise<T[]> {
  await page.goto("about:blank");
  const response = await page.request.post(`/civicrm/ajax/api4/${entity}/${action}`, {
    headers: { "X-Requested-With": "XMLHttpRequest" },
    form: { params: JSON.stringify(params) },
  });
  const body: unknown = await response.json();
  if (!response.ok()) throw new Error(`${entity}.${action}: ${JSON.stringify(body)}`);
  const values = typeof body === "object" && body !== null && "values" in body ? body.values : null;
  return asRows<T>(values, `${entity}.${action}`);
}

/** Sets the forms React renders; the page is left on about:blank. */
export async function setReactForms(page: Page, forms: string[]): Promise<void> {
  await quietApi(page, "Setting", "set", { values: { afreact_forms: forms } });
}

type ContrastData = Record<"fgColor" | "bgColor" | "fontSize" | "fontWeight", string>;

/** axe's color-contrast check data; its types leave it untyped. */
function isContrastData(data: unknown): data is ContrastData {
  if (typeof data !== "object" || data === null) return false;
  const values: Record<string, unknown> = Object.fromEntries(Object.entries(data));
  return ["fgColor", "bgColor", "fontSize", "fontWeight"].every(
    (key) => typeof values[key] === "string",
  );
}

/**
 * Axe findings in `scope` of the loaded page, one per element and without element content:
 * contrast failures by colours and font, which the theme decides, anything else by selector.
 * Admin gear menus are Angular-only. CKEditor's editing frame holds the field's content as a
 * page of its own, without main landmark or h1, the same under both renderers.
 */
export async function axeFindings(page: Page, scope: string): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .include(scope)
    .exclude(".crm-admin-block-context-dropdown")
    .exclude("iframe.cke_wysiwyg_frame")
    .analyze();
  return violations.flatMap((violation) =>
    violation.nodes.map((node) => {
      const data: unknown = node.any[0]?.data;
      return violation.id === "color-contrast" && isContrastData(data)
        ? `color-contrast: ${data.fgColor} on ${data.bgColor}, ${data.fontSize} ${data.fontWeight}`
        : `${violation.id}: ${node.target.join(" ")}`;
    }),
  );
}

/** React's findings that Angular does not share as theme contrast. */
export function ownFindings(react: string[], angular: string[]): string[] {
  const unmatched = [...angular];
  return react.filter((finding) => {
    const index = unmatched.indexOf(finding);
    if (index === -1 || !finding.startsWith("color-contrast:")) return true;
    unmatched.splice(index, 1);
    return false;
  });
}

/**
 * dnd-kit's keyboard sensor listens for keys from a zero timer after the pick-up, and the browser
 * runs a key event sent that instant before the timer. A timer queued after it fires after it.
 */
export const keysListened = (page: Page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        setTimeout(resolve, 0);
      }),
  );

export const pause = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** A caption in the corner from the first paint on. */
export async function label(page: Page, text: string) {
  await page.addInitScript((content) => {
    document.addEventListener("DOMContentLoaded", () => {
      const badge = document.createElement("div");
      badge.id = "video-label";
      badge.textContent = content;
      badge.style.cssText =
        "position:fixed;left:16px;bottom:16px;z-index:99999;padding:10px 16px;border-radius:6px;" +
        "background:#111827;color:#fff;font:600 22px system-ui";
      document.body.append(badge);
    });
  }, text);
}
