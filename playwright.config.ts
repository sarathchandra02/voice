import { defineConfig } from "@playwright/test";
const testPort = process.env.TEST_PORT || "5173";
if (
  !/^\d+$/.test(testPort) ||
  Number(testPort) < 1024 ||
  Number(testPort) > 65535
)
  throw new Error("TEST_PORT must be a port between 1024 and 65535.");
const baseURL = `http://127.0.0.1:${testPort}`;
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.browser.test.ts",
  workers: 1,
  use: {
    baseURL,
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: `npm run fixtures && npm run dev -- --port ${testPort}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
