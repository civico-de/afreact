/**
 * Records a tour over tables, lists, tabs and forms on each renderer; npm run video:tour puts the
 * two side by side. Every scene has a fixed slot, so both halves show the same scene at the same
 * time and the faster page waits. The groups, options and contact it works on are its own.
 */
import { expect, test, type Page } from "@playwright/test";
import { api, AUTH, label, pause, setDebug, type Renderer } from "./harness";

const LABELS: Record<Renderer, string> = {
  angular: "CiviCRM (Angular)",
  react: "afreact (React)",
};
const LOAD = { timeout: 30_000 };
// The groups demo lists groups named afreact_actions_%; the tour's carry their own suffix.
const GROUP_PREFIX = "afreact_actions_tour_";
const OPTIONS = "afreact_demo_order";
const LAST_NAME = "Tourexample";

const view = (page: Page) => page.locator(".afreact-render");
const rows = (page: Page) => view(page).locator(".crm-search-display table tbody tr");
const row = (page: Page, text: string) => rows(page).filter({ hasText: text });
const field = (page: Page, name: string) => view(page).locator(`af-field[name="${name}"]`).first();

interface Scene {
  title: string;
  form: string;
  /** Appended to the render URL, e.g. a filter in the hash. */
  suffix?: string;
  /** What must show before the scene counts as ready. */
  ready: string;
  seconds: number;
  act?: (page: Page, renderer: Renderer) => Promise<void>;
}

/** Sorts by the first sortable column, twice; pauses outlast SearchKit's 300 ms debounce. */
async function sort(page: Page) {
  const header = view(page).locator("th.crm-sortable-col").first();
  for (let click = 0; click < 2; click++) {
    await header.click();
    await pause(1_500);
  }
}

async function selectAndDisable(page: Page) {
  for (const title of ["Tour group A", "Tour group B"]) {
    await row(page, title).locator(".crm-search-ctrl-select-row").check();
    await pause(400);
  }
  await view(page).locator(".crm-search-task-menu").click();
  await pause(600);
  await view(page).locator(".dropdown-menu a", { hasText: "Disable Groups" }).click();
  await pause(800);
  await page.getByRole("button", { name: "Disable Groups" }).click();
  await expect(row(page, "Tour group A")).toContainText("No", LOAD);
  await pause(1_000);
  await sort(page);
}

async function editAndPickColumns(page: Page) {
  await view(page).locator('tbody td[data-field-name="job_title"] .crm-editable-enabled').click();
  const text = view(page).locator("crm-search-display-editable input").first();
  await text.fill("");
  await text.pressSequentially("Captain", { delay: 70 });
  await text.press("Enter");
  await expect(view(page).locator("crm-search-display-editable")).toHaveCount(0, LOAD);
  await pause(1_000);
  const picker = view(page).locator("details", { hasText: "Pick Columns" });
  await picker.locator("summary").click();
  await pause(600);
  await picker.getByRole("checkbox", { name: "Job title" }).uncheck();
  await pause(1_000);
  await picker.getByRole("button", { name: "All" }).click();
}

/** Drags the first option below the last one with the mouse. */
async function drag(page: Page) {
  const from = await row(page, "Order A").locator(".crm-draggable").boundingBox();
  const to = await row(page, "Order C").boundingBox();
  if (!from || !to) throw new Error("No box for the rows to drag");
  await pause(800);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + to.height * 0.75, { steps: 30 });
  await pause(400);
  await page.mouse.up();
  await expect(rows(page).last()).toContainText("Order A", LOAD);
}

async function switchTabs(page: Page) {
  const tab = (name: string) => view(page).locator(`.crm-tab-button[data-name="${name}"] a`);
  await field(page, "first_name").locator("input").pressSequentially("Paula", { delay: 70 });
  await tab("privacy").click();
  await pause(800);
  await field(page, "is_opt_out").locator("input").check();
  await pause(800);
  await tab("contacts").click();
  await expect(rows(page).first()).toBeVisible(LOAD);
  await pause(1_000);
  await sort(page);
}

async function openBranch(page: Page) {
  await pause(800);
  await view(page)
    .locator(".crm-search-display li", { hasText: "Individual" })
    .first()
    .locator(".crm-search-display-tree-collapse-toggle")
    .first()
    .click();
}

async function openSubRows(page: Page) {
  await pause(800);
  await view(page).locator(".crm-search-ctrl-toggle-row:visible").first().click();
}

async function fillRanges(page: Page) {
  const ids = field(page, "id").locator("input[type=number]");
  await ids.nth(0).pressSequentially("1", { delay: 70 });
  await ids.nth(1).pressSequentially("5", { delay: 70 });
}

async function fillFields(page: Page) {
  await field(page, "last_name").locator("input").pressSequentially("Example", { delay: 70 });
  const slider = field(page, "gender_id").locator("input[type=range]");
  await slider.focus();
  await slider.press("ArrowRight");
  await pause(600);
  const editor = field(page, "nick_name").frameLocator("iframe").locator("body");
  await editor.click();
  await editor.pressSequentially("Nick", { delay: 70 });
}

const TABLE = ".crm-search-display table tbody tr";
/** A core search page: shown, then sorted where a column sorts. */
const corePage = (title: string, form: string): Scene => ({
  title,
  form,
  ready: ".crm-search-display table",
  seconds: 7,
  async act(page) {
    if (await view(page).locator("th.crm-sortable-col").count()) await sort(page);
  },
});

const SCENES: Scene[] = [
  {
    title: "Bulk action and sorting",
    form: "afsearchAfreactDemoGroups",
    ready: TABLE,
    seconds: 16,
    act: selectAndDisable,
  },
  {
    title: "Editing in place, picking columns",
    form: "afsearchAfreactDemoEditable",
    suffix: `#?last_name=${LAST_NAME}`,
    ready: 'tbody td[data-field-name="job_title"] .crm-editable-enabled',
    seconds: 14,
    act: editAndPickColumns,
  },
  {
    title: "Drag to reorder",
    form: "afsearchAfreactDemoOrder",
    ready: ".crm-draggable",
    seconds: 10,
    act: drag,
  },
  {
    title: "Every column type",
    form: "afsearchAfreactDemoFeatures",
    ready: TABLE,
    seconds: 10,
    act: sort,
  },
  {
    title: "Collapsible rows",
    form: "afsearchAfreactDemoContactTypes",
    ready: TABLE,
    seconds: 8,
    act: openSubRows,
  },
  {
    title: "Tabs, a switch and a table",
    form: "afformAfreactDemoTabs",
    ready: 'af-field[name="first_name"] input',
    seconds: 16,
    act: switchTabs,
  },
  {
    title: "List",
    form: "afsearchAfreactDemoList",
    ready: ".crm-search-display-listitem",
    seconds: 6,
  },
  {
    title: "Grid",
    form: "afsearchAfreactDemoGrid",
    ready: ".crm-search-display-griditem",
    seconds: 6,
  },
  {
    title: "Tree",
    form: "afsearchAfreactDemoTree",
    ready: ".crm-search-display li",
    seconds: 8,
    act: openBranch,
  },
  {
    title: "Range filters",
    form: "afsearchAfreactDemoRanges",
    ready: TABLE,
    seconds: 10,
    act: fillRanges,
  },
  corePage("Membership types", "afsearchAdministerMembershipTypes"),
  corePage("Queues", "afsearchCiviCRMQueues"),
  corePage("Date preferences", "afsearchSettingsDatePreferences"),
  corePage("Print page formats", "afsearchPrintPagePDFFormats"),
  corePage("Site email addresses", "afsearchSiteEmailAddresses"),
  {
    title: "Slider and rich text",
    form: "afformAfreactDemoFields",
    ready: 'af-field[name="nick_name"] iframe',
    seconds: 12,
    act: fillFields,
  },
];

async function removeData(page: Page) {
  await page.goto("/civicrm/afreact/compare");
  await api(page, "Group", "delete", { where: [["name", "LIKE", `${GROUP_PREFIX}%`]] });
  await api(page, "OptionValue", "delete", { where: [["option_group_id:name", "=", OPTIONS]] });
  await api(page, "OptionGroup", "delete", { where: [["name", "=", OPTIONS]] });
  await api(page, "Contact", "delete", {
    where: [
      ["last_name", "=", LAST_NAME],
      ["source", "=", "Afreact tour"],
    ],
    useTrash: false,
  });
}

/** The same starting data for each recording. */
async function createData(page: Page) {
  await removeData(page);
  await api(page, "Group", "save", {
    records: ["A", "B", "C", "D"].map((letter) => ({
      title: `Tour group ${letter}`,
      name: `${GROUP_PREFIX}${letter.toLowerCase()}`,
      is_active: true,
    })),
  });
  await api(page, "OptionGroup", "create", { values: { name: OPTIONS, title: OPTIONS } });
  await api(page, "OptionValue", "save", {
    records: ["Order A", "Order B", "Order C"].map((name, index) => ({
      "option_group_id:name": OPTIONS,
      label: name,
      value: String(index + 1),
      weight: index + 1,
    })),
  });
  await api(page, "Individual", "create", {
    values: { first_name: "Paula", last_name: LAST_NAME, job_title: "Pilot", source: "Afreact tour" },
  });
}

let debugBefore: unknown;
test.beforeAll(async ({ browser }) => {
  debugBefore = await setDebug(browser, false);
});

for (const renderer of ["angular", "react"] as const) {
  test(`records the ${renderer} tour`, async ({ browser, viewport }) => {
    test.setTimeout(600_000);
    const setup = await browser.newContext({ storageState: AUTH });
    await createData(await setup.newPage());
    await setup.close();

    const context = await browser.newContext({
      storageState: AUTH,
      recordVideo: { dir: test.info().outputDir, size: viewport ?? undefined },
    });
    const page = await context.newPage();
    await label(page, LABELS[renderer]);
    let slotEnd = Date.now();
    for (const scene of SCENES) {
      slotEnd += scene.seconds * 1_000;
      const started = Date.now();
      await page.goto(
        `/civicrm/afreact/render?name=${scene.form}&renderer=${renderer}${scene.suffix ?? ""}`,
      );
      await expect(view(page).locator(scene.ready).first()).toBeVisible(LOAD);
      await expect(view(page).locator(".crm-search-loading-placeholder")).toHaveCount(0, LOAD);
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      await page.locator("#video-label").evaluate((badge, text) => {
        badge.textContent = text;
      }, `${LABELS[renderer]} · ${scene.title} · ready in ${seconds} s`);
      await scene.act?.(page, renderer);
      const left = slotEnd - Date.now();
      console.log(`${renderer} · ${scene.title}: ready in ${seconds} s, ${String(left)} ms left`);
      if (left > 0) await pause(left);
    }

    const video = page.video();
    if (!video) throw new Error("The video project records no video.");
    await context.close();
    await video.saveAs(`video/tour-${renderer}.webm`);
  });
}

test.afterAll(async ({ browser }) => {
  await setDebug(browser, debugBefore);
  const context = await browser.newContext({ storageState: AUTH });
  await removeData(await context.newPage());
  await context.close();
});
