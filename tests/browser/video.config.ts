/**
 * Records the demo video, outside the test suite (bun run video):
 *   CIVICRM_BASE_URL=http://localhost:8081 bun run video
 */
import { defineConfig, devices } from "@playwright/test";
import { AUTH } from "./harness";

const size = { width: 1280, height: 800 };

export default defineConfig({
  testDir: ".",
  outputDir: "../../test-results/video",
  timeout: 180_000,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "../../playwright-report" }]],
  use: {
    baseURL: process.env.CIVICRM_BASE_URL ?? "http://localhost:8080",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "video",
      testMatch: /.*\.video\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: AUTH,
        viewport: size,
      },
      dependencies: ["setup"],
    },
  ],
});
