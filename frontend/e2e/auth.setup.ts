import { expect, test as setup } from "@playwright/test";

setup("log in as admin", async ({ page }) => {
  await page.goto("/civicrm/login");
  await page.getByRole("textbox", { name: "Username" }).fill("admin");
  await page.getByRole("textbox", { name: "Password" }).fill("admin");
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page).not.toHaveURL(/\/civicrm\/login/, { timeout: 30_000 });
  await page.context().storageState({ path: "e2e/.auth/admin.json" });
});
