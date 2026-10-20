import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { test as base, type Browser, type BrowserContext, type Page } from "@playwright/test";

/** With E2E_COVERAGE=1 every page's V8 coverage of the bundle lands here, for coverage-report.ts. */
export const RAW = "test-results/v8-coverage";
const BUNDLE = /\/dist\/.+\.js(\?|$)/;
const on = !!process.env.E2E_COVERAGE;
const done = new WeakSet<Page>();
const tracked = new WeakSet<BrowserContext>();

async function save(page: Page) {
  const own = (await page.coverage.stopJSCoverage())
    .filter((entry) => BUNDLE.test(entry.url))
    .map(({ url, functions }) => ({ url, functions }));
  if (own.length) await writeFile(`${RAW}/${randomUUID()}.json`, JSON.stringify(own));
}

async function collect(page: Page) {
  if (done.has(page) || page.isClosed()) return;
  done.add(page);
  await save(page);
}

const start = (page: Page) => page.coverage.startJSCoverage({ resetOnNavigation: false });

function track(context: BrowserContext) {
  if (tracked.has(context)) return;
  tracked.add(context);
  context.on("page", (page) => {
    void start(page);
    // A page keeps every load of the bundle until stopped; a sweep's loads would crash the tab.
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      await save(page);
      await start(page);
      return goto(url, options);
    };
    const reload = page.reload.bind(page);
    page.reload = async (options) => {
      await save(page);
      await start(page);
      return reload(options);
    };
    const close = page.close.bind(page);
    page.close = async (options) => {
      await collect(page);
      await close(options);
    };
  });
  const close = context.close.bind(context);
  context.close = async (options) => {
    await Promise.all(context.pages().map(collect));
    await close(options);
  };
}

/** Contexts a spec opens itself are tracked as they open. */
function trackNew(browser: Browser) {
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const context = await newContext(options);
    track(context);
    return context;
  };
}

export const test = base.extend<{ jsCoverage: undefined }, { jsCoverageHooks: undefined }>({
  jsCoverageHooks: [
    async ({ browser }, use) => {
      if (on) {
        await mkdir(RAW, { recursive: true });
        trackNew(browser);
      }
      await use(undefined);
    },
    { scope: "worker", auto: true },
  ],
  jsCoverage: [
    async ({ browser }, use) => {
      await use(undefined);
      if (on)
        await Promise.all(browser.contexts().flatMap((context) => context.pages().map(collect)));
    },
    { auto: true },
  ],
  context: async ({ context }, use) => {
    if (on) track(context);
    await use(context);
    if (on) await Promise.all(context.pages().map(collect));
  },
});
