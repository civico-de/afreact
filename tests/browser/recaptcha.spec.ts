/**
 * crm-recaptcha2 on both renderers, with Google's script replaced by a stand-in and no request
 * leaving for Google: the same widget, the same refusal without a response, the same values sent.
 */
import { expect, test, type Browser, type Page, type Route } from "@playwright/test";
import { api, AUTH, isRecord, quietApi, type Renderer } from "./harness";

const FORM = "afformAfreactRecaptchaProbe";
const LAYOUT =
  '<af-form ctrl="afform"><crm-recaptcha2 recaptchatheme="dark"></crm-recaptcha2>' +
  '<button class="af-button btn btn-primary" crm-icon="fa-check" ng-click="afform.submit()">Submit</button></af-form>';
const LOAD = { timeout: 30_000 };

/** Google's API as far as both renderers use it: explicit render, and the class core's markup has. */
const FAKE_API = `(() => {
  const render = (box, options) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fake-recaptcha";
    button.dataset.sitekey = options.sitekey;
    button.dataset.theme = options.theme;
    button.textContent = "I am not a robot";
    button.addEventListener("click", () => options.callback("fake-response"));
    box.append(button);
    return 0;
  };
  window.grecaptcha = { ready: (callback) => callback(), render, reset: () => {} };
  for (const box of document.querySelectorAll(".g-recaptcha"))
    render(box, {
      sitekey: box.dataset.sitekey,
      theme: box.dataset.theme,
      callback: (response) => window[box.dataset.callback](response),
    });
})();`;

async function adminPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto("/civicrm/afreact/compare");
  return page;
}

/** The values of an Afform.submit call, whether sent alone or in a batch. */
function submitted(route: Route): unknown {
  const request = route.request();
  const body = new URLSearchParams(request.postData() ?? "");
  if (request.url().includes("/Afform/submit")) {
    const params: unknown = JSON.parse(body.get("params") ?? "null");
    return isRecord(params) ? params.values : undefined;
  }
  const calls: unknown = JSON.parse(body.get("calls") ?? "null");
  if (!isRecord(calls)) return undefined;
  const call = Object.values(calls).find(
    (each) => Array.isArray(each) && each[0] === "Afform" && each[1] === "submit",
  );
  return Array.isArray(call) && isRecord(call[2]) ? call[2].values : undefined;
}

async function open(page: Page, renderer: Renderer) {
  await page.route("https://www.google.com/**", (route) =>
    route.request().url().includes("/recaptcha/api.js")
      ? route.fulfill({ contentType: "text/javascript", body: FAKE_API })
      : route.abort(),
  );
  await page.goto(`/civicrm/afreact/render?name=${FORM}&renderer=${renderer}`);
  await expect(page.locator(".afreact-render .fake-recaptcha")).toBeVisible(LOAD);
}

test.beforeAll(async ({ browser }) => {
  const page = await adminPage(browser);
  await quietApi(page, "Afform", "create", {
    values: { name: FORM, type: "form", title: "Afreact recaptcha probe", layout: LAYOUT },
  });
  // Angular's module list knows a new form only after a flush.
  await quietApi(page, "System", "flush", {});
  await page.context().close();
});

test.afterAll(async ({ browser }) => {
  const page = await adminPage(browser);
  await api(page, "Afform", "revert", { where: [["name", "=", FORM]] });
  await page.context().close();
});

test("renders the same widget and refuses a submission without its response", async ({ page }) => {
  const seen: Partial<Record<Renderer, unknown>> = {};
  for (const renderer of ["angular", "react"] as const) {
    await open(page, renderer);
    const widget = page.locator(".afreact-render .fake-recaptcha");
    seen[renderer] = {
      sitekey: await widget.getAttribute("data-sitekey"),
      theme: await widget.getAttribute("data-theme"),
    };
    await page.locator(".afreact-render button", { hasText: "Submit" }).click();
    await expect(
      page.getByText("Please go back and complete the CAPTCHA at the bottom of this form.").first(),
    ).toBeVisible(LOAD);
  }
  // The key the server writes into the markup; a stack without one gets core's placeholder.
  expect(seen.react).toEqual(seen.angular);
  expect(seen.react).toMatchObject({ theme: "dark" });
});

test("sends the widget's response with the submission as Angular does", async ({ page }) => {
  const sent: Partial<Record<Renderer, unknown>> = {};
  for (const renderer of ["angular", "react"] as const) {
    await open(page, renderer);
    // The server would ask Google about the response, so the submission stops here.
    await page.route("**/civicrm/ajax/api4**", async (route) => {
      const values = submitted(route);
      if (values === undefined) return route.fallback();
      sent[renderer] = values;
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error_code: 0, error_message: "Stopped by the test." }),
      });
    });
    await page.locator(".afreact-render .fake-recaptcha").click();
    await page.locator(".afreact-render button", { hasText: "Submit" }).click();
    await expect.poll(() => sent[renderer], LOAD).toBeDefined();
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
  expect(sent.react).toEqual(sent.angular);
  expect(sent.react).toMatchObject({ extra: { recaptcha2: "fake-response" } });
});
