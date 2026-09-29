/**
 * Browser scenarios against the dev stack (.docker, ckup picks the port):
 *   CIVICRM_BASE_URL=http://localhost:8081 npx playwright test
 */
import { defineConfig, devices } from "@playwright/test";
import { AUTH } from "./tests/browser/harness";

export default defineConfig({
  testDir: "tests/browser",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.CIVICRM_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: AUTH },
      dependencies: ["setup"],
      testIgnore: /.*\.setup\.ts/,
    },
  ],
});
