/**
 * The finer points of a form on both renderers with the same steps: HTML in a label and a help
 * text, a live token in a content block, values from the hash for a field, a display-only date
 * and an extra field, a text area's character count, a required checkbox list, a container's
 * style, the primary flag in repeated join records, and the extra field in the submission.
 */
import { expect, test, type Page } from "@playwright/test";
import { api, AUTH, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const render = (renderer: Renderer) =>
  `/civicrm/afreact/render?name=afformAfreactDemoDetails&renderer=${renderer}` +
  "#?first_name=Ada&birth_date=1990-05-17&remark=From%20the%20link";
const field = (page: Page, name: string) =>
  page.locator(`.afreact-render af-field[name="${name}"]`);
const text = async (page: Page, selector: string) =>
  (await page.locator(`.afreact-render ${selector}`).innerText()).replace(/\s+/g, " ").trim();

const contacts: number[] = [];

test.afterAll(async ({ browser }) => {
  if (!contacts.length) return;
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto("/civicrm/afreact/compare");
  await api(page, "Contact", "delete", { where: [["id", "IN", contacts]], useTrash: false });
  await context.close();
});

interface Observed {
  label: string;
  labelEmphasis: number;
  help: string;
  helpStrong: number;
  firstName: string;
  remark: string;
  greeting: string[];
  birthDate: string;
  count: string[];
  countClass: boolean[];
  methodsRequired: boolean[];
  border: string;
  background: string;
  primary: boolean[][];
  extra: unknown;
  savedPrimary: boolean[];
}

async function observe(page: Page, renderer: Renderer): Promise<Observed> {
  const lastName = `Details${RUN}${renderer}`;
  await page.goto(render(renderer));
  const first = field(page, "first_name").locator("input");
  await expect(first).toHaveValue("Ada");
  const remark = page.locator(".afreact-render").getByLabel("Remark");
  await expect(remark).toHaveValue("From the link");
  const greeting = () => text(page, ".afreact-demo-greeting");
  const count = field(page, "nick_name").locator(".af-character-count");
  const hasClass = (name: string) =>
    count.evaluate((element, status) => element.classList.contains(status), name);
  const methods = field(page, "preferred_communication_method").locator("input[type=checkbox]");
  const anyRequired = () =>
    methods.evaluateAll((boxes) =>
      boxes.some((box) => box instanceof HTMLInputElement && box.required),
    );
  const radios = field(page, "is_primary").locator("input[type=radio]");
  const primary = () =>
    radios.evaluateAll((all) =>
      all.map((radio) => radio instanceof HTMLInputElement && radio.checked),
    );
  const container = page.locator(".afreact-render fieldset.af-container");
  const style = (property: string) =>
    container.evaluate(
      (element, name) => getComputedStyle(element).getPropertyValue(name),
      property,
    );

  const observed: Observed = {
    label: await text(page, 'af-field[name="first_name"] label'),
    labelEmphasis: await field(page, "first_name").locator("label em").count(),
    help: await text(page, 'af-field[name="first_name"]'),
    helpStrong: await field(page, "first_name").locator("strong").count(),
    firstName: await first.inputValue(),
    remark: await remark.inputValue(),
    greeting: [await greeting()],
    birthDate: await text(page, 'af-field[name="birth_date"]'),
    count: [(await count.innerText()).trim()],
    countClass: [await hasClass("text-success")],
    methodsRequired: [await anyRequired()],
    border: await style("border-top-width"),
    background: await style("background-color"),
    primary: [await primary()],
    extra: null,
    savedPrimary: [],
  };

  // Angular shows a token's value once the input has changed, React as it is typed.
  await first.fill("Grace");
  await first.blur();
  await expect(page.locator(".afreact-render .afreact-demo-greeting")).toContainText("Grace");
  observed.greeting.push(await greeting());

  await field(page, "nick_name").locator("textarea").fill("Nineteen characters");
  await expect(count).toContainText("19");
  observed.count.push((await count.innerText()).trim());
  observed.countClass.push(await hasClass("text-danger"));

  await methods.first().check();
  observed.methodsRequired.push(await anyRequired());

  await page.locator(".afreact-render .af-repeat-add-btn").click();
  await expect(radios).toHaveCount(2);
  observed.primary.push(await primary());
  await radios.nth(1).check();
  observed.primary.push(await primary());
  // Removing the primary record makes the first remaining one primary.
  await page.locator(".afreact-render .af-repeat-remove-btn").nth(1).click();
  await expect(radios).toHaveCount(1);
  await expect(radios).toBeChecked();
  observed.primary.push(await primary());

  await field(page, "last_name").locator("input").fill(lastName);
  await field(page, "email").locator("input").fill(`details.${RUN}${renderer}@example.org`);
  const submitted = page.waitForRequest((request) => request.url().includes("Afform/submit"));
  await page.getByRole("button", { name: "Save" }).click();
  const params = new URLSearchParams((await submitted).postData() ?? "").get("params");
  const { values } = JSON.parse(params ?? "{}") as { values?: { extra?: unknown } };
  observed.extra = values?.extra;
  await expect(page.getByText("Contact saved.")).toBeVisible();

  const [saved] = await api<{ id: number }>(page, "Individual", "get", {
    select: ["id"],
    where: [["last_name", "=", lastName]],
  });
  contacts.push(saved!.id);
  const emails = await api<{ is_primary: boolean }>(page, "Email", "get", {
    select: ["is_primary"],
    where: [["contact_id", "=", saved!.id]],
  });
  observed.savedPrimary = emails.map((email) => email.is_primary);
  return observed;
}

test("both renderers show and save the form's details alike", async ({ page }) => {
  const react = await observe(page, "react");
  const byAngular = await observe(page, "angular");
  expect(react).toEqual(byAngular);
  expect(react).toMatchObject({
    label: "Your first name",
    labelEmphasis: 1,
    helpStrong: 1,
    firstName: "Ada",
    remark: "From the link",
    greeting: ["Hello Ada!", "Hello Grace!"],
    count: ["0 / 20", "19 / 20"],
    countClass: [true, true],
    methodsRequired: [true, false],
    border: "2px",
    background: "rgb(240, 248, 255)",
    primary: [[true], [true, false], [false, true], [true]],
    extra: { fields: { remark: "From the link" } },
    savedPrimary: [true],
  });
  expect(react.help).toContain("As in your passport");
  expect(react.birthDate).toMatch(/1990/);
});
