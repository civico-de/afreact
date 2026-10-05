/**
 * What follows a submission, with the same steps on both renderers: the confirmation message
 * with a token, the redirect with tokens, and a form closed for submissions.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { AUTH, quietApi, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const LAST_NAME = `Afreact ${RUN}`;
const FORMS = {
  message: "afformAfreactTestMessage",
  redirect: "afformAfreactTestRedirect",
  closed: "afformAfreactTestClosed",
};
const LAYOUT = `<af-form ctrl="afform">
  <af-entity type="Individual" name="Individual1" label="Individual 1" actions="{create: true, update: false}" security="RBAC" />
  <fieldset af-fieldset="Individual1" class="af-container" af-title="Individual 1">
    <af-field name="first_name" />
    <af-field name="last_name" />
  </fieldset>
  <button class="af-button btn btn-primary" crm-icon="fa-check" ng-click="afform.submit()">Save</button>
</af-form>`;
// Characters that would end a query value or the URL if they reached the redirect as typed.
const QUERY_NAME = "A&B=1 #x";
const MARKUP_NAME = "<b>Ada</b>";
const CLOSED = "This form is not currently open for submissions.";

async function adminPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: AUTH });
  return context.newPage();
}

test.beforeAll(async ({ browser }) => {
  const page = await adminPage(browser);
  const settings: Record<keyof typeof FORMS, object> = {
    message: {
      confirmation_type: "show_confirmation_message",
      confirmation_message: "<p>Thanks, <em>[Individual1.0.first_name]</em>!</p>",
    },
    redirect: {
      confirmation_type: "redirect_to_url",
      redirect: "civicrm/contact/view?reset=1&cid=[Individual1.0.id]&n=[Individual1.0.first_name]",
    },
    closed: { submit_enabled: false },
  };
  for (const [key, name] of Object.entries(FORMS) as [keyof typeof FORMS, string][]) {
    await quietApi(page, "Afform", "create", {
      layoutFormat: "html",
      values: {
        name,
        type: "form",
        title: `Afreact ${key} ${RUN}`,
        permission: ["access CiviCRM"],
        layout: LAYOUT,
        ...settings[key],
      },
    });
  }
  await page.context().close();
});

test.afterAll(async ({ browser }) => {
  const page = await adminPage(browser);
  await quietApi(page, "Contact", "delete", {
    where: [["last_name", "=", LAST_NAME]],
    useTrash: false,
  });
  await quietApi(page, "Afform", "revert", { where: [["name", "IN", Object.values(FORMS)]] });
  await page.context().close();
});

const open = (page: Page, form: string, renderer: Renderer) =>
  page.goto(`/civicrm/afreact/render?name=${form}&renderer=${renderer}`);

const input = (page: Page, name: string) =>
  page.locator(`.afreact-render af-field[name="${name}"] input`);
const submitButton = (page: Page) =>
  page.locator('.afreact-render button.af-button:has-text("Save")');

async function submit(page: Page, form: string, renderer: Renderer, firstName: string) {
  await open(page, form, renderer);
  await input(page, "first_name").fill(firstName);
  await input(page, "last_name").fill(LAST_NAME);
  await submitButton(page).click();
}

interface Observed {
  confirmation: { text: string; emphasis: string[]; markup: number };
  redirect: { path: string; name: string | null; cid: boolean };
  closed: { submitDisabled: boolean; formDisabled: boolean; notified: boolean };
}

async function observe(page: Page, renderer: Renderer): Promise<Observed> {
  await submit(page, FORMS.message, renderer, MARKUP_NAME);
  const confirmation = page.locator(".afreact-render .afform-confirmation");
  await expect(confirmation).toBeVisible();
  const message = {
    text: (await confirmation.innerText()).trim(),
    emphasis: await confirmation.locator("em").allInnerTexts(),
    markup: await confirmation.locator("b").count(),
  };

  await submit(page, FORMS.redirect, renderer, QUERY_NAME);
  await page.waitForURL(/civicrm\/contact\/view/);
  const url = new URL(page.url());

  await open(page, FORMS.closed, renderer);
  const notification = page.locator("#crm-notification-container");
  await expect(notification).toContainText(CLOSED);
  return {
    confirmation: message,
    redirect: {
      path: url.pathname.replace(/^.*?(civicrm\/)/, "$1"),
      name: url.searchParams.get("n"),
      cid: /^\d+$/.test(url.searchParams.get("cid") ?? ""),
    },
    closed: {
      submitDisabled: await submitButton(page).isDisabled(),
      formDisabled: await page
        .locator(".afreact-render af-form")
        .evaluate((element) => element.classList.contains("disabled")),
      notified: (await notification.innerText()).includes("Sorry"),
    },
  };
}

test("both renderers follow a submission alike", async ({ page }) => {
  const react = await observe(page, "react");
  const byAngular = await observe(page, "angular");
  expect(react).toEqual(byAngular);
  expect(react).toEqual({
    // The server escapes the submitted value inside the admin's markup.
    confirmation: { text: `Thanks, ${MARKUP_NAME}!`, emphasis: [MARKUP_NAME], markup: 0 },
    // and encodes it inside the redirect's query.
    redirect: { path: "civicrm/contact/view", name: QUERY_NAME, cid: true },
    closed: {
      submitDisabled: true,
      formDisabled: true,
      notified: true,
    },
  });
});

test("React moves the focus to the confirmation message and keeps a closed form locked", async ({
  page,
}) => {
  await submit(page, FORMS.message, "react", "Ada");
  await expect(page.locator(".afreact-render .afform-confirmation")).toBeFocused();
  await open(page, FORMS.closed, "react");
  await expect(page.locator(".afreact-render [role=alert]")).toHaveText(CLOSED);
  // afForm disables only the submit button; React the whole form.
  await expect(input(page, "first_name")).toBeDisabled();
});
