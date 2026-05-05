import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const CONTENT_SCRIPT_PATH = path.join(ROOT, "src", "content.js");
const CONTENT_STYLE_PATH = path.join(ROOT, "src", "styles.css");
const OUTPUT_DIR = path.join(ROOT, "tests", "visual-snapshots");

const SNAPSHOT_TARGETS = [
  {
    id: "all-products-grid",
    url: "https://plus.telstra.com.au/rewards/explore?offer=all",
    viewport: { width: 1440, height: 2200 }
  },
  {
    id: "product-page",
    url: "https://plus.telstra.com.au/rewards/explore/25571",
    viewport: { width: 1440, height: 1800 }
  },
  {
    id: "product-page-with-offer",
    url: "https://plus.telstra.com.au/rewards/explore/25574",
    viewport: { width: 1440, height: 1800 }
  },
  {
    id: "gift-card-page",
    url: "https://plus.telstra.com.au/rewards/explore/25530",
    viewport: { width: 1440, height: 1800 }
  }
];

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function waitForTargetContent(page, targetId) {
  if (targetId === "all-products-grid") {
    await page.waitForSelector("li.tplus-rewards-product-tile", { timeout: 30_000 });
    return;
  }

  await page.waitForFunction(() => {
    const bodyText = document.body?.innerText || "";
    const hasPoints = /\b[\d,]+\s*pts\b/i.test(bodyText);
    const hasCash = /\bor\s*\$[\d,]+(?:\.\d{1,2})?\b/i.test(bodyText);
    return hasPoints && hasCash;
  }, { timeout: 30_000 });
}

function resolveBrowserPath() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv) return fromEnv;

  const candidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium"
  ];

  return candidates.find(candidate => existsSync(candidate)) || null;
}

async function main() {
  const contentScript = await fs.readFile(CONTENT_SCRIPT_PATH, "utf8");
  const contentStyle = await fs.readFile(CONTENT_STYLE_PATH, "utf8");

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const executablePath = resolveBrowserPath();
  if (!executablePath) {
    throw new Error("No local Chrome/Chromium executable found. Set CHROME_PATH to your browser binary.");
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--ignore-certificate-errors",
      "--disable-blink-features=AutomationControlled"
    ]
  });

  try {
    for (const target of SNAPSHOT_TARGETS) {
      const context = await browser.newContext({
        viewport: target.viewport,
        userAgent: CHROME_UA,
        locale: "en-AU",
        timezoneId: "Australia/Sydney",
        extraHTTPHeaders: {
          "Accept-Language": "en-AU,en;q=0.9"
        }
      });
      const page = await context.newPage();

      await page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      });

      await page.goto(target.url, {
        waitUntil: "domcontentloaded",
        timeout: 60_000
      });

      await waitForTargetContent(page, target.id);

      await page.addStyleTag({ content: contentStyle });
      await page.addScriptTag({ content: contentScript });

      await page.waitForTimeout(2_000);

      const outputPath = path.join(OUTPUT_DIR, `${target.id}.png`);
      await page.screenshot({
        path: outputPath,
        fullPage: false
      });

      await context.close();
      console.log(`✓ ${target.id}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
