import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

function resolveBrowserPath() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv) return fromEnv;

  const candidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium"
  ];

  return candidates.find(c => existsSync(c)) || undefined;
}

const executablePath = resolveBrowserPath();

export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.test.mjs",
  timeout: 90_000,

  reporter: [["html", { open: "on-failure" }]],

  snapshotDir: "tests/visual-snapshots",
  snapshotPathTemplate: "{snapshotDir}/{arg}{ext}",

  use: {
    locale: "en-AU",
    timezoneId: "Australia/Sydney",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    extraHTTPHeaders: { "Accept-Language": "en-AU,en;q=0.9" },
    launchOptions: {
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--ignore-certificate-errors",
        "--disable-blink-features=AutomationControlled"
      ],
      ...(executablePath ? { executablePath } : {})
    }
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
