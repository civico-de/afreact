/**
 * Records the same session on each renderer with a cold browser cache and a warm server, as a
 * returning visitor meets it; npm run video puts the two side by side. Debug is off as in
 * production and restored afterwards.
 */
import { expect, test, type Locator, type Response } from "@playwright/test";
import {
  api,
  AUTH,
  driver,
  label,
  pause,
  PAGES,
  readyAt,
  setDebug,
  type Renderer,
} from "./harness";

const LABELS: Record<Renderer, string> = {
  angular: "CiviCRM (Angular)",
  react: "afreact (React)",
};

// Only a page request answers a table click: SearchKit's row_count call may still be in flight.
const isPageRun = (response: Response) =>
  response.url().includes("/ajax/api4") &&
  decodeURIComponent(response.request().postData() ?? "").includes('"return":"page:');

const typeInto = (field: Locator, text: string) =>
  field.locator("input, textarea").first().pressSequentially(text, { delay: 70 });

let debugBefore: unknown;
let lastIdBefore: number | undefined;
test.beforeAll(async ({ browser }) => {
  debugBefore = await setDebug(browser, false);
});

for (const renderer of ["angular", "react"] as const) {
  test(`records ${renderer}`, async ({ browser, viewport }) => {
    const warmup = await browser.newContext({ storageState: AUTH });
    const warm = await warmup.newPage();
    await warm.goto(PAGES[renderer], { waitUntil: "commit" });
    await readyAt(warm);
    await warmup.close();

    const context = await browser.newContext({
      storageState: AUTH,
      recordVideo: { dir: test.info().outputDir, size: viewport ?? undefined },
    });
    const page = await context.newPage();
    await label(page, LABELS[renderer]);
    await page.goto(PAGES[renderer], { waitUntil: "commit" });
    const readyMs = await readyAt(page);
    if (lastIdBefore === undefined) {
      const [last] = await api<{ id: number }>(page, "Contact", "get", {
        select: ["id"],
        orderBy: { id: "DESC" },
        limit: 1,
      });
      lastIdBefore = last?.id ?? 0;
    }
    const seconds = (readyMs / 1000).toFixed(1);
    const ready = `${LABELS[renderer]} · ready in ${seconds} s`;
    await page.locator("#video-label").evaluate((badge, text) => {
      badge.textContent = text;
    }, ready);
    await pause(1_500);

    const form = driver(page, renderer);
    await typeInto(form.field("first_name"), "Paula");
    await typeInto(form.field("last_name"), "Example");
    await form.select("gender_id", "Female");
    await pause(500);
    await form.date("birth_date", "1980-05-17");
    await typeInto(form.field("email"), "paula.example@example.org");
    await form.select("location_type_id", "Work");
    await pause(800);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Contact saved.")).toBeVisible();
    await pause(1_500);

    const search = page.locator(".afreact-demo section").nth(1);
    await search.scrollIntoViewIfNeeded();
    // Pauses longer than SearchKit's 300 ms debounce, which drops faster clicks.
    for (const target of [
      search.locator("th", { hasText: "Email" }),
      search.locator(".pagination-next a"),
    ]) {
      await Promise.all([page.waitForResponse(isPageRun), target.click()]);
      await expect(search.locator("tbody tr").first().locator("a[href]")).toBeVisible();
      await pause(1_500);
    }

    const video = page.video();
    if (!video) throw new Error("The video project records no video.");
    await context.close();
    await video.saveAs(`video/${renderer}.webm`);
    console.log(ready);
  });
}

test.afterAll(async ({ browser }) => {
  await setDebug(browser, debugBefore);
  if (lastIdBefore === undefined) return;
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto("/civicrm/afreact/compare");
  await api(page, "Contact", "delete", {
    where: [
      ["id", ">", lastIdBefore],
      ["last_name", "=", "Example"],
      ["source", "=", "Afreact demo"],
    ],
    useTrash: false,
  });
  await context.close();
});
