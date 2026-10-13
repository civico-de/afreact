/**
 * Every form, block and search form on the site, opened in React's builder: each palette tab
 * shows without an error, a shut section tells of no flaw and an open one holds no alert or
 * invalid input, and the canvas shows no alert. Healthy forms raise no warning. Reports names,
 * tabs and the warning's text only. SWEEP_FORMS=name1,name2 sweeps only those forms.
 */
import { stripVTControlCharacters } from "node:util";
import { expect, test, type Page } from "@playwright/test";
import { api } from "./harness";

const FLAWED = "A value is missing or invalid";

/** What the open tab warns of: flawed shut sections, then alerts and invalid inputs. */
async function tabWarnings(page: Page): Promise<string[]> {
  const palette = page.locator("#afGuiEditor-palette");
  const found: string[] = [];
  const heads = palette.locator(".afreact-section-head > button");
  for (const head of await heads.all()) {
    if ((await head.getAttribute("aria-expanded")) === "true") continue;
    const title = (await head.textContent())?.trim() ?? "";
    const description = await head.evaluate((button) => {
      const ids = button.getAttribute("aria-describedby")?.split(" ") ?? [];
      return ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
    });
    if (description.includes(FLAWED)) found.push(`shut ${title} flawed`);
    await head.click();
  }
  for (const alert of await palette.locator("[role=alert]:not(:empty)").all())
    found.push(`alert "${((await alert.textContent()) ?? "").trim().slice(0, 120)}"`);
  const invalid = await palette.locator(":invalid:not(form, fieldset)").evaluateAll((all) =>
    all.map((element) => {
      const label = element.id
        ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent
        : null;
      return (
        label ??
        element.getAttribute("aria-label") ??
        element.getAttribute("title") ??
        element.getAttribute("name") ??
        element.tagName
      );
    }),
  );
  // A label ends in the required marker.
  for (const name of invalid) found.push(`invalid "${name.trim().replace(/\s*\*$/, "")}"`);
  return found;
}

test.setTimeout(3_600_000);

test("every form's palette tabs show without an error or a false warning", async ({ page }) => {
  page.setDefaultTimeout(30_000);
  const raised: string[] = [];
  page.on("dialog", (dialog) => {
    raised.push(`${dialog.type()} dialog`);
    void dialog.accept();
  });
  page.on("pageerror", (error) =>
    raised.push(`page error ${error.message.split("\n")[0]?.slice(0, 160) ?? error.name}`),
  );
  page.on("console", (message) => {
    if (message.type() === "error")
      raised.push(`console error ${message.text().split("\n")[0]?.slice(0, 160) ?? ""}`);
  });
  await page.goto("/civicrm/admin/afreact/afform#/list");
  const forms = await api<{ name: string; type: string; title: string | null; layout: unknown }>(
    page,
    "Afform",
    "get",
    {
      select: ["name", "type", "title", "layout"],
      where: [["type", "IN", ["form", "block", "search"]]],
      orderBy: { name: "ASC" },
    },
  );
  const only = process.env.SWEEP_FORMS?.split(",");
  const swept = forms.filter(
    ({ name, type, layout }) =>
      (!only || only.includes(name)) &&
      // Neither builder draws a form without af-form; form-sweep covers its message.
      (type !== "form" || JSON.stringify(layout).includes('"#tag":"af-form"')),
  );
  expect(swept.length).toBeGreaterThan(0);
  const found: string[] = [];
  for (const { name, title } of swept) {
    raised.length = 0;
    // A form without a title cannot be saved in either builder, which both say at its input.
    const expected = title ? [] : [`${name} [Settings]: invalid "Title"`];
    try {
      // A new document, so the previous form's canvas cannot pass for this one.
      await page.goto("about:blank");
      await page.goto(`/civicrm/admin/afreact/afform#/edit/${name}`);
      await expect(page.locator("#afGuiEditor-canvas-body")).toBeVisible({ timeout: 30_000 });
      const tabs = page.getByRole("tablist", { name: "Form parts" }).getByRole("tab");
      await expect(tabs.first()).toBeVisible();
      const count = await tabs.count();
      for (let index = 0; index < count; index++) {
        const tab = tabs.nth(index);
        const label = ((await tab.textContent()) ?? "").trim();
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        // Queries a tab starts, such as a filter's field, settle before it is judged.
        await page.waitForLoadState("networkidle");
        for (const warning of await tabWarnings(page)) {
          const finding = `${name} [${label}]: ${warning}`;
          if (!expected.includes(finding)) found.push(finding);
        }
      }
      const canvas = page.locator("#afGuiEditor-canvas-body [role=alert]:not(:empty)");
      for (const alert of await canvas.all())
        found.push(`${name} [canvas]: alert "${((await alert.textContent()) ?? "").trim()}"`);
      for (const error of raised) found.push(`${name}: ${error}`);
    } catch (error) {
      const lines =
        error instanceof Error ? stripVTControlCharacters(error.message).split("\n") : ["failed"];
      const message = lines
        .filter((line, index) => index === 0 || /^(Received|Timeout)/.test(line.trim()))
        .map((line) => line.trim())
        .join(" ");
      found.push(`${name}: ${[message, ...raised].join(", ")}`);
      await page.goto("about:blank");
    }
  }
  expect(found).toEqual([]);
});
