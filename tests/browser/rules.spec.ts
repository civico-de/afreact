/**
 * Live form rules on both renderers with the same steps: ts() and crmUrl() in text and links,
 * af-if (which drops the values it hid and restores the default on re-show), af-required,
 * af-disabled and a token default.
 */
import { expect, test, type Page } from "@playwright/test";
import type { Renderer } from "./harness";

const render = (renderer: Renderer) =>
  `/civicrm/afreact/render?name=afformAfreactDemoRules&renderer=${renderer}`;

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
