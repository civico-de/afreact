/**
 * Live form rules on both renderers with the same steps: ts() and crmUrl() in text and links,
 * af-if (which drops the values it hid and restores the default on re-show), af-required,
 * af-disabled and a token default.
 */
import { expect, test, type Page } from "@playwright/test";
import { api, AUTH, type Renderer } from "./harness";

const render = (renderer: Renderer, suffix = "") =>
  `/civicrm/afreact/render?name=afformAfreactDemoRules&renderer=${renderer}${suffix}`;

const input = (page: Page, name: string) =>
  page.locator(`.afreact-render af-field[name="${name}"] input`);

/** AngularJS on the Angular page. */
declare const angular: {
  getTestability: (element: Element) => { whenStable: (callback: () => void) => void };
};

/** afField sets a shown field's default in a $timeout; Angular's testability waits for it. */
async function settled(page: Page, renderer: Renderer) {
  if (renderer === "angular")
    await input(page, "job_title").evaluate(
      (element) =>
        new Promise<void>((resolve) => {
          angular.getTestability(element).whenStable(resolve);
        }),
    );
}

interface Observed {
  text: string;
  href: string | null;
  jobTitleShown: boolean[];
  lastNameRequired: boolean[];
  nickName: string[];
  middleNameDisabled: boolean[];
  jobTitleAfterHide: string;
  button: string;
}

async function observe(page: Page, renderer: Renderer): Promise<Observed> {
  await page.goto(render(renderer));
  const first = input(page, "first_name");
  await expect(first).toBeVisible();
  // The token default is calculated once the prefill has landed.
  await expect(input(page, "nick_name")).toHaveValue("Dear ");
  const help = page.locator(".afreact-render p.help");
  const shown = () => input(page, "job_title").isVisible();
  const required = () =>
    input(page, "last_name").evaluate((el) => el instanceof HTMLInputElement && el.required);
  const nick = () => input(page, "nick_name").inputValue();
  const disabled = () => input(page, "middle_name").isDisabled();
  const observed: Observed = {
    text: (await help.innerText()).trim(),
    href: await help.locator("a").getAttribute("href"),
    jobTitleShown: [await shown()],
    lastNameRequired: [await required()],
    nickName: [await nick()],
    middleNameDisabled: [await disabled()],
    jobTitleAfterHide: "",
    button: (await page.locator(".afreact-render button.af-button").innerText()).trim(),
  };
  await first.pressSequentially("ada");
  await expect(input(page, "job_title")).toBeVisible();
  observed.jobTitleShown.push(await shown());
  observed.lastNameRequired.push(await required());
  // The token default follows the typed name a render later.
  await expect(input(page, "nick_name")).toHaveValue(/ada$/);
  observed.nickName.push(await nick());
  await input(page, "job_title").fill("Engineer");
  await first.fill("");
  await expect(input(page, "job_title")).toBeHidden();
  observed.jobTitleShown.push(await shown());
  await first.pressSequentially("lock");
  await expect(input(page, "job_title")).toBeVisible();
  await settled(page, renderer);
  observed.jobTitleAfterHide = await input(page, "job_title").inputValue();
  observed.middleNameDisabled.push(await disabled());
  return observed;
}

test("both renderers apply the form's live rules alike", async ({ page }) => {
  const react = await observe(page, "react");
  const byAngular = await observe(page, "angular");
  expect(react).toEqual(byAngular);
  expect(react).toMatchObject({
    text: "Learn more... Address Settings",
    jobTitleShown: [false, true, false],
    lastNameRequired: [false, true],
    nickName: ["Dear ", "Dear ada"],
    middleNameDisabled: [false, true],
    jobTitleAfterHide: "Staff",
    button: "Save",
  });
  expect(react.href).toContain("civicrm/admin/setting/preferences/address");
});

const RUN = Date.now().toString(36);
const contacts: number[] = [];

test.afterAll(async ({ browser }) => {
  if (!contacts.length) return;
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto("/civicrm/afreact/compare");
  await api(page, "Contact", "delete", { where: [["id", "IN", contacts]], useTrash: false });
  await context.close();
});

/**
 * Core recalculates a token default once the prefill changes the fields it refers to, which
 * rewrites the stored value (comparison.md, "A token default overwrites the loaded value").
 * React keeps the loaded value until the user changes a referenced field.
 */
test("a loaded record keeps its stored value over the token default on React", async ({ page }) => {
  await page.goto("/civicrm/afreact/compare");
  const [contact] = await api<{ id: number }>(page, "Individual", "create", {
    values: {
      first_name: "Ada",
      last_name: `Rules${RUN}`,
      nick_name: "Stored",
      source: "Afreact demo",
    },
  });
  contacts.push(contact!.id);
  const nick: Record<Renderer, string> = { react: "", angular: "" };
  for (const renderer of ["angular", "react"] as const) {
    await page.goto(render(renderer, `#?Individual1=${String(contact!.id)}`));
    await expect(input(page, "first_name")).toHaveValue("Ada");
    await settled(page, renderer);
    nick[renderer] = await input(page, "nick_name").inputValue();
    // A change to a referenced field calculates the default again on both.
    await input(page, "first_name").fill("Grace");
    await expect(input(page, "nick_name")).toHaveValue("Dear Grace");
  }
  expect(nick).toEqual({ react: "Stored", angular: "Dear Ada" });
});
