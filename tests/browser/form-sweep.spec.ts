/**
 * Every form, block and search form on the site, opened in React's builder and saved with only
 * its description changed, sends the stored record back as core's builder would: no difference
 * besides core's own fill-ins, and no notice. A form without a title cannot be saved, as in core,
 * and one without af-form is refused with a message. Every write is caught and dropped. Reports
 * names and paths only. SWEEP_FORMS=name1,name2 sweeps only those forms.
 */
import { stripVTControlCharacters } from "node:util";
import { expect, test, type Page, type Route } from "@playwright/test";
import { formRoundTrip } from "../../src/admin/afform/roundTrip";
import { api, isRecord } from "./harness";

const SUFFIX = " (sweep)";
const NOTICES = [
  "cannot be edited in the React builder",
  "Other extensions change the classic FormBuilder",
];

/** The record an Afform.save request carries, or undefined for any other call. */
function savedRecord(route: Route): Record<string, unknown> | undefined {
  const request = route.request();
  if (!request.url().includes("/Afform/save")) return undefined;
  const params: unknown = JSON.parse(
    new URLSearchParams(request.postData() ?? "").get("params") ?? "null",
  );
  const record: unknown =
    isRecord(params) && Array.isArray(params.records) ? params.records[0] : undefined;
  if (!isRecord(record)) throw new Error("Afform.save carried no record.");
  return record;
}

/** Afform.convert, as the builder calls it. */
async function convertLayout(page: Page, layout: unknown, from: string, to: string) {
  const [converted] = await api<{ layout: unknown }>(page, "Afform", "convert", {
    layout,
    from,
    to,
    formatWhitespace: true,
  });
  if (!converted) throw new Error("Afform.convert returned nothing.");
  return converted.layout;
}

/** Any other request that would write a form. */
const writesForm = (route: Route) =>
  /Afform\/(save|create|update|delete|revert)/.test(route.request().url());

async function sentSave(page: Page, name: string, title: string) {
  await page.goto(`/civicrm/admin/afreact/afform#/edit/${name}`);
  // Between two forms only the hash changes; the first load after a cache flush is slow.
  await expect(page.getByRole("textbox", { name: /^Title/ })).toHaveValue(title, {
    timeout: 30_000,
  });
  await expect(page.locator("#afGuiEditor-canvas-body")).toBeVisible();
  const notices = async () => {
    let count = 0;
    for (const notice of NOTICES) count += await page.getByText(notice).count();
    return count;
  };
  const opened = await notices();
  // The form's settings tab comes first; a search or a canvas tab may share its name.
  await page.locator("#afGuiEditor-palette").getByRole("tab", { name: "Settings" }).first().click();
  const description = page.getByRole("textbox", { name: "Description" });
  const before = await description.inputValue();
  await description.fill(`${before}${SUFFIX}`);
  await description.blur();
  // An empty rich text block opens with a Save button of its own, as in core.
  const save = page
    .getByRole("button", { name: "Save", exact: true })
    .and(page.locator(":not(#afGuiEditor-canvas-body *)"));
  if (!title) {
    // Core's builder does not save a form without a title either.
    await expect(save).toBeDisabled();
    return { sent: undefined, before, notices: Math.max(opened, await notices()) };
  }
  let sent: Record<string, unknown> | undefined;
  await page.route("**/civicrm/ajax/api4/**", async (route) => {
    const record = savedRecord(route);
    if (record) sent = record;
    else if (!writesForm(route)) return route.fallback();
    return route.abort();
  });
  try {
    await save.click();
    // Saving waits up to 30 seconds for other extensions' panels.
    await expect.poll(() => sent !== undefined, { timeout: 35_000 }).toBe(true);
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
  return { sent, before, notices: Math.max(opened, await notices()) };
}

test.setTimeout(3_600_000);

test("every form saves back unedited as core's builder would, without a notice", async ({
  page,
}) => {
  // One stuck step is a finding of that form, not an hour's wait.
  page.setDefaultTimeout(30_000);
  // Leaving a form whose save was dropped asks to discard its changes; any other dialog or page
  // error, such as another extension's save notes, is a finding of the form open at the time.
  const raised: string[] = [];
  page.on("dialog", (dialog) => {
    const leaving =
      dialog.type() === "beforeunload" || dialog.message().startsWith("You have unsaved changes.");
    if (!leaving) raised.push(`${dialog.type()} dialog`);
    void dialog.accept();
  });
  page.on("pageerror", (error) =>
    raised.push(`page error ${error.message.split("\n")[0]?.slice(0, 160) ?? error.name}`),
  );
  await page.goto("/civicrm/admin/afreact/afform#/list");
  const forms = await api<{ name: string }>(page, "Afform", "get", {
    select: ["name"],
    where: [["type", "IN", ["form", "block", "search"]]],
    orderBy: { name: "ASC" },
  });
  const blocks = await api<{ directive_name: string }>(page, "Afform", "get", {
    select: ["directive_name"],
    where: [["type", "=", "block"]],
  });
  // The option core's editor sets where a form has none.
  const confirmationType = await page.evaluate(() => {
    const admin = window.CRM.vars?.afreactAdmin?.afAdmin;
    const fields: unknown = admin?.afform_fields;
    const spec: unknown =
      fields && typeof fields === "object" && "confirmation_type" in fields
        ? fields.confirmation_type
        : undefined;
    const options: unknown =
      spec && typeof spec === "object" && "options" in spec ? spec.options : undefined;
    const first: unknown = Array.isArray(options) ? options[0] : undefined;
    return first && typeof first === "object" && "id" in first ? String(first.id) : "";
  });
  expect(confirmationType).not.toBe("");
  const only = process.env.SWEEP_FORMS?.split(",");
  const swept = forms.filter(({ name }) => !only || only.includes(name));
  expect(swept.length).toBeGreaterThan(0);
  const found: string[] = [];
  for (const { name } of swept) {
    // As Afform.loadAdminData reads it.
    const [stored] = await api<Record<string, unknown>>(page, "Afform", "get", {
      select: ["*", "directive_name"],
      layoutFormat: "shallow",
      formatWhitespace: true,
      where: [["name", "=", name]],
    });
    raised.length = 0;
    try {
      if (!stored) throw new Error("not loaded");
      if (stored.type === "form" && !JSON.stringify(stored.layout).includes('"#tag":"af-form"')) {
        // Neither builder can draw it; React says so instead of breaking.
        await page.goto(`/civicrm/admin/afreact/afform#/edit/${name}`);
        await expect(
          page.getByRole("alert").filter({ hasText: "has no af-form element" }),
        ).toBeVisible();
        if (raised.length) found.push(`${name}: ${raised.join(", ")}`);
        continue;
      }
      const { sent, before, notices } = await sentSave(
        page,
        name,
        typeof stored.title === "string" ? stored.title : "",
      );
      if (before !== (stored.description ?? "")) found.push(`${name}: description shown`);
      if (sent) {
        // The one edit made to enable saving, taken back.
        if (sent.description !== `${before}${SUFFIX}`) found.push(`${name}: description sent`);
        sent.description = stored.description;
        // The builder sends its layout as HTML. Both sides are read back from HTML, so markup
        // compares without the indentation each conversion gives it.
        const shallow = async (layout: unknown, from: string) => {
          const html = from === "html" ? layout : await convertLayout(page, layout, from, "html");
          return convertLayout(page, html, "html", "shallow");
        };
        const compared = { ...stored, layout: await shallow(stored.layout, "shallow") };
        if (typeof sent.layout === "string") sent.layout = await shallow(sent.layout, "html");
        const { differs } = formRoundTrip(compared, sent, {
          blocks: blocks.map((block) => block.directive_name),
          confirmationType,
        });
        if (differs.length) found.push(`${name}: ${differs.join(", ")}`);
      }
      if (notices) found.push(`${name}: ${String(notices)} notices`);
      if (raised.length) found.push(`${name}: ${raised.join(", ")}`);
    } catch (error) {
      // The first line names the check, a "Received" line what the page showed instead.
      const lines =
        error instanceof Error ? stripVTControlCharacters(error.message).split("\n") : ["failed"];
      const message = lines
        .filter((line, index) => index === 0 || /^(Received|Timeout)/.test(line.trim()))
        .map((line) => line.trim())
        .join(" ");
      found.push(`${name}: ${[message, ...raised].join(", ")}`);
      // A fresh page for the next form, as a crashed editor no longer follows the hash.
      await page.goto("about:blank");
      await page.goto("/civicrm/admin/afreact/afform#/list");
    }
  }
  expect(found).toEqual([]);
});
