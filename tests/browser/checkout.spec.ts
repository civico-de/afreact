/**
 * The checkout block of core's donation form: both renderers show the fixed option's description
 * (afCheckoutBlock with `checkout_option: 'pay_later'` in the entity's data).
 */
import { expect, test } from "@playwright/test";
import type { Renderer } from "./harness";

const LOAD = { timeout: 30_000 };

for (const renderer of ["react", "angular"] as const satisfies Renderer[]) {
  test(`${renderer}: the checkout block shows the pay-later description`, async ({ page }) => {
    await page.goto(`/civicrm/afreact/render?name=afformNewDonation&renderer=${renderer}`);
    const block = page.locator('.afreact-render af-field[name="checkout_params"]');
    await expect(block).toBeVisible(LOAD);
    await expect(block).toContainText("No payment will be taken now.");
    await expect(block.getByText("Checkout is in Test Mode.")).toHaveCount(0);
    await expect(block.locator("input, select")).toHaveCount(0);
  });
}
