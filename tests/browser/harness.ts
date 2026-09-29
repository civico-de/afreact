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
