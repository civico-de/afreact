/**
 * The checkout block of core's donation form: both renderers show the fixed option's description
 * (afCheckoutBlock with `checkout_option: 'pay_later'` in the entity's data). The afreactcheckout
 * fixture's options bring their own Angular templates, which React runs as islands: card fields,
 * a wallet button that takes over the submit, and a widget mounted after the submit.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./coverage";
import type { Renderer } from "./harness";

const LOAD = { timeout: 30_000 };
const RENDERERS = ["react", "angular"] as const satisfies Renderer[];
const DONATION = "afformAfreactCheckoutDonation";
const SUBMIT = "/ajax/api4/Afform/submit";
/** The asset builder's script of the island's Angular modules. */
const isBundle = (url: URL) => url.searchParams.get("an") === "angular-modules.js";

for (const renderer of RENDERERS) {
  test(`${renderer}: the checkout block shows the pay-later description`, async ({ page }) => {
    await page.goto(`/civicrm/afreact/render?name=afformNewDonation&renderer=${renderer}`);
    const block = page.locator('.afreact-render af-field[name="checkout_params"]');
    await expect(block).toBeVisible(LOAD);
    await expect(block).toContainText("No payment will be taken now.");
    await expect(block.getByText("Checkout is in Test Mode.")).toHaveCount(0);
    await expect(block.locator("input, select")).toHaveCount(0);
  });
}

async function openDonation(page: Page, renderer: Renderer): Promise<Locator> {
  await page.goto(`/civicrm/afreact/render?name=${DONATION}&renderer=${renderer}`);
  const form = page.locator(".afreact-render");
  await expect(form.getByLabel("First Name")).toBeVisible(LOAD);
  return form;
}

async function fillDonor(form: Locator): Promise<void> {
  await form.getByLabel("First Name").fill("Ada");
  await form.getByLabel("Last Name").fill("Demo");
  await form.getByLabel("Amount").fill("12");
}

const field = (value: unknown, key: string | number): unknown => Reflect.get(Object(value), key);

/** Runs `act` and returns the checkout_params of the Afform.submit it sends. */
async function sentParams(page: Page, act: () => Promise<void>): Promise<unknown> {
  const request = page.waitForRequest((sent) => sent.url().includes(SUBMIT));
  await act();
  const params: unknown = JSON.parse(
    new URLSearchParams((await request).postData() ?? "").get("params") ?? "null",
  );
  const fields = field(field(field(field(params, "values"), "Contribution1"), 0), "fields");
  // Angular sends the field once the template has written into it; the server reads none as empty.
  return field(fields, "checkout_params") ?? {};
}

/** The Afform.submit requests the page sends from now on. */
function submits(page: Page): string[] {
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(SUBMIT)) sent.push(request.url());
  });
  return sent;
}

for (const renderer of RENDERERS) {
  test(`${renderer}: card fields in the option's template hold the submit and send the details`, async ({
    page,
  }) => {
    const sent = submits(page);
    const form = await openDonation(page, renderer);
    await fillDonor(form);
    await form.getByLabel("Demo card").check();
    await expect(form.getByText("Card details for the demo; nothing is charged.")).toBeVisible();
    await form.getByRole("button", { name: "Donate" }).click();
    await expect(page.getByText("Please fill all required fields.").first()).toBeVisible();
    expect(sent).toEqual([]);
    await form.getByLabel("Card Type").selectOption("Visa");
    await form.getByLabel("Card Number").fill("4111111111111111");
    await form.getByLabel("Expiration month").selectOption("03");
    await form.getByLabel("Expiration year").selectOption("2031");
    const params = await sentParams(page, () =>
      form.getByRole("button", { name: "Donate" }).click(),
    );
    expect(params).toEqual({
      credit_card_type: "Visa",
      credit_card_number: "4111111111111111",
      credit_card_exp_date: { M: "03", Y: "2031" },
    });
    await expect(form.getByText("Card Visa ending 1111, expiring 03/2031, accepted.")).toBeVisible(
      LOAD,
    );
    await expect(form.getByLabel("First Name")).toBeHidden();
  });

  test(`${renderer}: a wallet button takes over the submit while the form is valid`, async ({
    page,
  }) => {
    const form = await openDonation(page, renderer);
    // Details typed for another option do not go with the wallet's.
    await form.getByLabel("Demo card").check();
    await form.getByLabel("Card Number").fill("4111111111111111", LOAD);
    await form.getByLabel("Demo wallet").check();
    const pay = form.getByRole("button", { name: "Pay EUR with Demo Wallet" });
    await expect(pay).toBeDisabled(LOAD);
    await expect(form.getByRole("button", { name: "Donate" })).toBeHidden();
    await fillDonor(form);
    await expect(pay).toBeEnabled(LOAD);
    const params = await sentParams(page, () => pay.click());
    expect(params).toEqual({ payment_source_type: "demo-wallet" });
    await expect(form.getByText(/^Order DEMO-\d+ approved, paid by demo-wallet\.$/)).toBeVisible(
      LOAD,
    );
    await expect(form.getByLabel("First Name")).toBeHidden();
  });

  test(`${renderer}: the submit button returns when the wallet is no longer chosen`, async ({
    page,
  }) => {
    const form = await openDonation(page, renderer);
    const pay = form.getByRole("button", { name: "Pay EUR with Demo Wallet" });
    await form.getByLabel("Demo wallet").check();
    await expect(pay).toBeVisible(LOAD);
    await form.getByLabel("Pay Later").check();
    await expect(pay).toHaveCount(0);
    await expect(form.getByRole("button", { name: "Donate" })).toBeVisible();
  });

  test(`${renderer}: a widget replaces the form after the submit`, async ({ page }) => {
    const form = await openDonation(page, renderer);
    await fillDonor(form);
    await form.getByLabel("Demo widget").check();
    await expect(form.getByText("You finish the payment in the next step.")).toBeVisible(LOAD);
    const params = await sentParams(page, () =>
      form.getByRole("button", { name: "Donate" }).click(),
    );
    expect(params).toEqual({});
    await expect(
      form.getByText(/^Demo widget demo_public_key mounted with demo_secret_\d+\.$/),
    ).toBeVisible(LOAD);
    await expect(form.getByLabel("First Name")).toBeHidden();
  });
}

test("react: the checkout modules load only once a templated option is chosen", async ({
  page,
}) => {
  const bundles: string[] = [];
  page.on("request", (request) => {
    if (isBundle(new URL(request.url()))) bundles.push(request.url());
  });
  const form = await openDonation(page, "react");
  await form.getByLabel("Pay Later").check();
  await expect(form.getByText("No payment will be taken now.")).toBeVisible();
  // Core puts AngularJS with crmResource on every page; afCheckout comes with the island.
  const loaded = () =>
    page.evaluate(() => {
      const angular: unknown = Reflect.get(window, "angular");
      const module: unknown = Reflect.get(Object(angular), "module");
      if (typeof module !== "function") throw new Error("AngularJS is not on the page.");
      try {
        Reflect.apply(module, angular, ["afCheckout"]);
        return true;
      } catch {
        return false;
      }
    });
  expect(await loaded()).toBe(false);
  expect(bundles).toEqual([]);
  await form.getByLabel("Demo card").check();
  await expect(form.getByLabel("Card Number")).toBeVisible(LOAD);
  expect(await loaded()).toBe(true);
  expect(bundles).toHaveLength(1);
});

test("react: an option whose template cannot load says so", async ({ page }) => {
  await page.route(isBundle, (route) => route.abort());
  const form = await openDonation(page, "react");
  await form.getByLabel("Demo card").check();
  await expect(form.getByRole("alert")).toHaveText(
    /^Demo card could not load: Could not load /,
    LOAD,
  );
  await expect(form.getByLabel("Card Number")).toHaveCount(0);
  // The status names the failure once the prefill is done, which disables the submit until then.
  await expect(form.locator(".afreact-status")).toHaveText(
    "Demo card could not load, so the form cannot be submitted.",
  );
  await expect(form.getByRole("button", { name: "Donate" })).toBeDisabled();
  await form.getByLabel("Pay Later").check();
  await expect(form.getByRole("button", { name: "Donate" })).toBeEnabled();
});

test("react: the submit waits until the template's modules are up", async ({ page }) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(isBundle, async (route) => {
    await held;
    await route.continue();
  });
  const form = await openDonation(page, "react");
  await fillDonor(form);
  await form.getByLabel("Demo card").check();
  const donate = form.getByRole("button", { name: "Donate" });
  await expect(form.locator(".afreact-status")).toHaveText("Loading Demo card…");
  await expect(donate).toBeDisabled();
  release();
  await expect(form.getByLabel("Card Number")).toBeVisible(LOAD);
  await expect(donate).toBeEnabled();
  await expect(form.locator(".afreact-status")).toHaveText("");
});

test("react: the template's fields lock while the submit runs", async ({ page }) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname.endsWith(SUBMIT),
    async (route) => {
      await held;
      await route.continue();
    },
  );
  const form = await openDonation(page, "react");
  await fillDonor(form);
  await form.getByLabel("Demo card").check();
  await form.getByLabel("Card Type").selectOption("Visa", LOAD);
  await form.getByLabel("Card Number").fill("4111111111111111");
  await form.getByLabel("Expiration month").selectOption("03");
  await form.getByLabel("Expiration year").selectOption("2031");
  await form.getByRole("button", { name: "Donate" }).click();
  await expect(form.locator(".afreact-status")).toHaveText("Saving…");
  await expect(form.getByLabel("Card Number")).toBeDisabled();
  await expect(form.getByLabel("Card Type")).toBeDisabled();
  release();
  await expect(form.getByText("Card Visa ending 1111, expiring 03/2031, accepted.")).toBeVisible(
    LOAD,
  );
});
