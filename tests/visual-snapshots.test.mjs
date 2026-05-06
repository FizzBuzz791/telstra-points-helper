import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const CONTENT_SCRIPT_PATH = path.join(ROOT, "src", "content.js");
const CONTENT_STYLE_PATH = path.join(ROOT, "src", "styles.css");

let contentScript;
let contentStyle;
const SCREENSHOT_OPTIONS = {
  fullPage: false,
  maxDiffPixelRatio: 0.0001
};

test.beforeAll(async () => {
  [contentScript, contentStyle] = await Promise.all([
    fs.readFile(CONTENT_SCRIPT_PATH, "utf8"),
    fs.readFile(CONTENT_STYLE_PATH, "utf8")
  ]);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
});

async function waitForTargetContent(page, targetId) {
  if (targetId === "all-products-grid") {
    await expect
      .poll(() => page.url(), { timeout: 60_000 })
      .toContain("/rewards/explore");

    await expect
      .poll(() => page.locator("li.tplus-rewards-product-tile").count(), { timeout: 60_000 })
      .toBeGreaterThan(0);
    return;
  }

  await page.waitForFunction(() => {
    const bodyText = document.body?.innerText || "";
    const hasPoints = /\b[\d,]+\s*pts\b/i.test(bodyText);
    const hasCash =
      /\bor\s*\$[\d,]+(?:\.\d{1,2})?\b/i.test(bodyText) ||
      /gift card amount:\s*\$[\d,]+(?:\.\d{1,2})?/i.test(bodyText) ||
      /\$[\d,]+(?:\.\d{1,2})?\s*e?gift card/i.test(bodyText);
    return hasPoints && hasCash;
  }, { timeout: 30_000 });
}

async function injectAndSettle(page) {
  await page.addStyleTag({ content: contentStyle });
  await page.addScriptTag({ content: contentScript });
  await page.waitForTimeout(2_000);
}

test("all-products-grid: badges appear on product tiles", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 2200 });
  await page.goto("https://plus.telstra.com.au/rewards/explore?offer=all", {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });

  await waitForTargetContent(page, "all-products-grid");
  await injectAndSettle(page);

  // Web-first assertion: retries until timeout.
  await expect
    .poll(() => page.locator(".tph-wrapper").count(), { timeout: 60_000 })
    .toBeGreaterThan(0);

  await expect(page).toHaveScreenshot("all-products-grid.png", SCREENSHOT_OPTIONS);
});

test("product-page: shows exactly one product badge", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1800 });
  await page.goto("https://plus.telstra.com.au/rewards/explore/25571", {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });

  await waitForTargetContent(page, "product-page");
  await injectAndSettle(page);

  const badgeCount = await page.$$eval(".tph-product-badge", els => els.length);
  expect(badgeCount).toBe(1);

  await expect(page).toHaveScreenshot("product-page.png", SCREENSHOT_OPTIONS);
});

test("product-page-with-offer: shows exactly one product badge", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1800 });
  await page.goto("https://plus.telstra.com.au/rewards/explore/25574", {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });

  await waitForTargetContent(page, "product-page-with-offer");
  await injectAndSettle(page);

  const badgeCount = await page.$$eval(".tph-product-badge", els => els.length);
  expect(badgeCount).toBe(1);

  await expect(page).toHaveScreenshot("product-page-with-offer.png", SCREENSHOT_OPTIONS);
});

test("gift-card-page: shows exactly one badge with valid cpp text", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1800 });
  await page.goto("https://plus.telstra.com.au/rewards/explore/24785", {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });

  await waitForTargetContent(page, "gift-card-page");
  await injectAndSettle(page);

  const badgeCount = await page.$$eval(".tph-product-badge", els => els.length);
  expect(badgeCount).toBe(1);

  const badgeText = await page.$eval(".tph-product-badge .tph-badge", el => el.textContent.trim());
  expect(badgeText).toMatch(/^\d+\.\d{2}\s+cpp$/);

  await expect(page).toHaveScreenshot("gift-card-page.png", SCREENSHOT_OPTIONS);
});
