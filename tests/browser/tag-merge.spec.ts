/**
 * The merge tags task on a tag search: each renderer merges its own pair of tags into the
 * second, renamed, and the kept tag and its taggings must come out alike. Core master only.
 */
import { expect, test, type Page } from "@playwright/test";
import { api, API_PAGE, AUTH, quietApi, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const LOAD = { timeout: 30_000 };
const FORM = "afsearchAfreactTagMerge";
const SEARCH = "Afreact_Tag_Merge";
const DISPLAY = "Afreact_Tag_Merge_Table";
const prefix = (renderer: Renderer) => `Merge${RUN}${renderer}`;
const kept = (renderer: Renderer) => `Kept ${RUN} ${renderer}`;
const render = (renderer: Renderer) =>
  `/civicrm/afreact/render?name=${FORM}&renderer=${renderer}#?label=${prefix(renderer)}`;

interface Merged {
  tags: string[];
  /** Per contact, by position, the labels of its tags. */
  tagged: string[][];
}

/** Per renderer: tags A and B, and a contact tagged with each. */
const fixture: Partial<Record<Renderer, { tags: number[]; contacts: number[] }>> = {};
let mergeable = false;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto(API_PAGE);
  const actions = await quietApi<{ name: string }>(page, "Tag", "getActions", {
    where: [["name", "=", "merge"]],
  });
  mergeable = actions.length > 0;
  if (!mergeable) {
    await context.close();
    return;
  }
  // Saved by name, so a run cut short before its cleanup does not block the next.
  await quietApi(page, "SavedSearch", "save", {
    match: ["name"],
    records: [
      {
        name: SEARCH,
        label: SEARCH,
        api_entity: "Tag",
        api_params: { version: 4, select: ["id", "label"], where: [] },
      },
    ],
  });
  await quietApi(page, "SearchDisplay", "save", {
    match: ["name"],
    records: [
      {
        name: DISPLAY,
        label: DISPLAY,
        "saved_search_id.name": SEARCH,
        type: "table",
        settings: {
          actions: true,
          sort: [["label", "ASC"]],
          columns: [{ type: "field", key: "label", label: "Label" }],
        },
      },
    ],
  });
  await quietApi(page, "Afform", "create", {
    values: {
      name: FORM,
      title: FORM,
      type: "search",
      layout:
        '<div af-fieldset=""><af-field name="label"></af-field>' +
        `<crm-search-display-table search-name="${SEARCH}" display-name="${DISPLAY}">` +
        "</crm-search-display-table></div>",
    },
  });
  // The Angular module list is cached, so the page would not know the new form.
  await quietApi(page, "System", "flush", {});
  for (const renderer of ["react", "angular"] as const) {
    const tags = await quietApi<{ id: number }>(page, "Tag", "save", {
      records: ["A", "B"].map((letter) => ({ label: `${prefix(renderer)} ${letter}` })),
    });
    const contacts = await quietApi<{ id: number }>(page, "Individual", "save", {
      records: ["Aa", "Bb"].map((first) => ({ first_name: first, last_name: prefix(renderer) })),
    });
    await quietApi(page, "EntityTag", "save", {
      records: contacts.map((contact, index) => ({
        entity_table: "civicrm_contact",
        entity_id: contact.id,
        tag_id: tags[index]?.id,
      })),
    });
    fixture[renderer] = {
      tags: tags.map((tag) => tag.id),
      contacts: contacts.map((contact) => contact.id),
    };
  }
  await context.close();
});

test.afterAll(async ({ browser }) => {
  if (!mergeable) return;
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto(API_PAGE);
  const tags = Object.values(fixture).flatMap((row) => row.tags);
  const contacts = Object.values(fixture).flatMap((row) => row.contacts);
  try {
    if (contacts.length)
      await quietApi(page, "Contact", "delete", {
        where: [["id", "IN", contacts]],
        useTrash: false,
      });
    if (tags.length) await quietApi(page, "Tag", "delete", { where: [["id", "IN", tags]] });
  } finally {
    await quietApi(page, "Afform", "revert", { where: [["name", "=", FORM]] });
    await quietApi(page, "SavedSearch", "delete", { where: [["name", "=", SEARCH]] });
    await quietApi(page, "System", "flush", {});
    await context.close();
  }
});

/** The renderer's tags left and each contact's tag labels. */
async function merged(page: Page, renderer: Renderer): Promise<Merged> {
  const { tags, contacts } = fixture[renderer] ?? { tags: [], contacts: [] };
  const left = await api<{ label: string }>(page, "Tag", "get", {
    select: ["label"],
    where: [["id", "IN", tags]],
    orderBy: { label: "ASC" },
  });
  const tagged = await api<{ entity_id: number; "tag_id.label": string }>(
    page,
    "EntityTag",
    "get",
    {
      select: ["entity_id", "tag_id.label"],
      where: [
        ["entity_table", "=", "civicrm_contact"],
        ["entity_id", "IN", contacts],
      ],
    },
  );
  return {
    tags: left.map((tag) => tag.label),
    tagged: contacts.map((contact) =>
      tagged
        .filter((row) => row.entity_id === contact)
        .map((row) => row["tag_id.label"])
        .sort(),
    ),
  };
}

async function mergeTags(page: Page, renderer: Renderer) {
  const target = `${prefix(renderer)} B`;
  await page.goto(render(renderer));
  const rows = page.locator(".afreact-render tbody tr");
  await expect(rows).toHaveCount(2, LOAD);
  for (const row of await rows.all()) await row.locator(".crm-search-ctrl-select-row").check();
  await page.locator(".afreact-render .crm-search-task-menu").click();
  await page.locator(".afreact-render .dropdown-menu a", { hasText: "Merge Tags" }).click();
  if (renderer === "react") {
    const dialog = page.getByRole("dialog", { name: "Merge Tags" });
    const label = dialog.getByRole("textbox", { name: "Label" });
    await expect(label).toHaveValue(`${prefix(renderer)} A`, LOAD);
    await dialog.getByRole("combobox", { name: "Tag to keep" }).selectOption({ label: target });
    await expect(label).toHaveValue(target);
    await label.fill(kept(renderer));
    await dialog.getByRole("button", { name: "Merge tags" }).click();
    await expect(dialog).toBeHidden(LOAD);
    return;
  }
  const dialog = page.locator(".ui-dialog", { hasText: "Merge Tags" });
  const label = dialog.locator("#crm-search-task-tag-merge-label");
  await expect(label).toHaveValue(`${prefix(renderer)} A`, LOAD);
  await dialog.locator("#crm-search-task-tag-merge-target").selectOption({ label: target });
  await expect(label).toHaveValue(target);
  await label.fill(kept(renderer));
  await dialog.getByRole("button", { name: "Merge tags" }).click();
  await expect(dialog).toBeHidden(LOAD);
}

test("both renderers merge the tags into the kept one alike", async ({ page }) => {
  test.skip(!mergeable, "Tag.merge exists on core master only");
  const seen: Partial<Record<Renderer, Merged>> = {};
  for (const renderer of ["react", "angular"] as const) {
    await mergeTags(page, renderer);
    await expect.poll(() => merged(page, renderer).then((row) => row.tags.length), LOAD).toBe(1);
    seen[renderer] = await merged(page, renderer);
  }
  const expected = (renderer: Renderer) => ({
    tags: [kept(renderer)],
    tagged: [[kept(renderer)], [kept(renderer)]],
  });
  expect(seen.angular).toEqual(expected("angular"));
  expect(seen.react).toEqual(expected("react"));
});
