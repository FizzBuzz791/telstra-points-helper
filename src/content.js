const CARD_SELECTOR = "li.tplus-rewards-product-tile";

const POINTS_REGEX = /([\d,]+)\s*pts/i;
const CASH_OR_REGEX = /or\s*\$([\d,]+(?:\.\d{1,2})?)/i;
const TITLE_GIFT_CARD_REGEX = /\$([\d,]+(?:\.\d{1,2})?)\s*e?gift card/i;
const SPEC_GIFT_CARD_REGEX = /gift card amount:\s*\$([\d,]+(?:\.\d{1,2})?)/i;

const seenCards = new WeakSet();

function isRewardsPage() {
  return window.location.pathname.startsWith("/rewards/");
}

function num(value) {
  return Number(value.replace(/,/g, ""));
}

function firstMatch(text, regex) {
  const match = text.match(regex);
  return match ? num(match[1]) : null;
}

function getRating(cpp) {
  if (cpp >= 0.30) return "excellent";
  if (cpp >= 0.25) return "good";
  if (cpp >= 0.20) return "ok";
  return "poor";
}

function createBadge(points, cash, extraClass = "") {
  const cpp = (cash / points) * 100;
  const rating = getRating(cpp);

  const wrapper = document.createElement("div");
  wrapper.className = `tph-wrapper tph-${rating} ${extraClass}`.trim();
  wrapper.innerHTML = `
    <span class="tph-badge" title="$${cash.toFixed(2)} / ${points.toLocaleString()} points">
      ${cpp.toFixed(2)} cpp
    </span>
    <span class="tph-detail">${rating.toUpperCase()}</span>
  `;

  return wrapper;
}

/**
 * Catalogue cards
 */
function annotateCatalogueCard(card) {
  if (!isRewardsPage()) return;
  if (seenCards.has(card) || card.querySelector(".tph-wrapper")) return;

  const text = card.textContent || "";
  const points = firstMatch(text, POINTS_REGEX);
  const cash = firstMatch(text, CASH_OR_REGEX);

  if (!points || !cash) return;

  seenCards.add(card);

  const pointsNode = findSmallestElementContaining(card, POINTS_REGEX);
  const badge = createBadge(points, cash);

  if (pointsNode) {
    pointsNode.insertAdjacentElement("beforebegin", badge);
  } else {
    card.appendChild(badge);
  }
}

/**
 * Product detail pages
 */
function isProductPage() {
  return /^\/rewards\/explore\/[^/]+/.test(window.location.pathname);
}

function getProductCashValue(text) {
  return (
    firstMatch(text, CASH_OR_REGEX) ??
    firstMatch(text, SPEC_GIFT_CARD_REGEX) ??
    firstMatch(text, TITLE_GIFT_CARD_REGEX)
  );
}

function findSmallestElementContaining(root, regex) {
  const candidates = Array.from(root.querySelectorAll("h1, h2, h3, p, span, div"))
    .filter(el => regex.test(el.textContent || ""))
    .filter(el => !el.closest(".tph-wrapper"));

  return candidates.sort((a, b) => {
    const aLen = (a.textContent || "").length;
    const bLen = (b.textContent || "").length;
    return aLen - bLen;
  })[0] || null;
}

function findProductPointsNode() {
  const nodes = Array.from(document.querySelectorAll("h1, h2, h3, p, span, div"))
    .filter(el => POINTS_REGEX.test(el.textContent || ""))
    .filter(el => !el.closest(".tph-wrapper"))
    .filter(el => !el.closest(CARD_SELECTOR));

  // Score candidates to avoid PDP slider text like "0 pts + $1,399".
  const candidates = nodes
    .map(el => {
      const text = (el.textContent || "").trim();
      const points = firstMatch(text, POINTS_REGEX);
      if (!points || points <= 0) return null;

      let score = 0;

      // Prefer the main offer text: "578,100 pts or $1,399".
      if (CASH_OR_REGEX.test(text)) score += 120;

      // Penalize redemption-slider/summary text patterns.
      if (/\+\s*\$[\d,]+/.test(text)) score -= 60;
      if (/\bminimum\b/i.test(text)) score -= 40;

      // Prefer compact blocks and realistic points values.
      if (text.length <= 40) score += 25;
      score += Math.min(points / 20000, 20);
      score -= Math.min(text.length / 30, 12);

      return { el, points, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.el || null;
}

function annotateProductPage() {
  if (!isProductPage()) return;

  // Exactly one PDP badge.
  document.querySelectorAll(".tph-product-badge").forEach(el => el.remove());

  // Use visible text only to avoid parsing numbers embedded in script/style tags.
  const pageText = document.body.innerText || "";
  const pointsNode = findProductPointsNode();
  const points = pointsNode ? firstMatch(pointsNode.textContent || "", POINTS_REGEX) : null;
  const cash = getProductCashValue(pageText);

  if (!points || !cash) return;

  const badge = createBadge(points, cash, "tph-product-badge");

  pointsNode.insertAdjacentElement("beforebegin", badge);
}

/**
 * Scan orchestration
 */
function scanCatalogue(root = document) {
  if (!isRewardsPage()) return;

  if (root instanceof HTMLElement && root.matches(CARD_SELECTOR)) {
    annotateCatalogueCard(root);
  }

  root.querySelectorAll?.(CARD_SELECTOR).forEach(annotateCatalogueCard);
}

function scan(root = document) {
  if (!isRewardsPage()) return;

  scanCatalogue(root);
  annotateProductPage();
}

const scheduleIdle = window.requestIdleCallback
  ? callback => window.requestIdleCallback(callback, { timeout: 1000 })
  : callback => setTimeout(callback, 150);

let scanTimer = null;
function scheduleScan(root = document) {
  if (!isRewardsPage()) return;

  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => scheduleIdle(() => scan(root)), 150);
}

function scheduleRetryScans() {
  [100, 500, 1500, 5000, 10000, 15000].forEach(delay => {
    setTimeout(() => scheduleScan(document), delay);
  });
}

scheduleRetryScans();

const observer = new MutationObserver(mutations => {
  const rootsToScan = new Set();

  for (const mutation of mutations) {
    if (mutation.type === "characterData") {
      const parent = mutation.target.parentElement;
      if (!parent) continue;

      const parentCard = parent.closest?.(CARD_SELECTOR);
      if (parentCard) {
        rootsToScan.add(parentCard);
        continue;
      }

      const text = mutation.target.textContent || "";
      if (isProductPage() && (POINTS_REGEX.test(text) || /\$[\d,]+/.test(text))) {
        rootsToScan.add(document);
      }
      continue;
    }

    for (const node of mutation.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;

      const directCard = node.matches?.(CARD_SELECTOR) ? node : null;
      const parentCard = node.closest?.(CARD_SELECTOR);
      const childCard = node.querySelector?.(CARD_SELECTOR);

      if (directCard) {
        rootsToScan.add(directCard);
        continue;
      }

      if (parentCard) {
        rootsToScan.add(parentCard);
        continue;
      }

      if (childCard) {
        rootsToScan.add(node);
        continue;
      }

      // Product detail pages are not card-based.
      const text = node.textContent || "";
      if (isProductPage() && (POINTS_REGEX.test(text) || /\$[\d,]+/.test(text))) {
        rootsToScan.add(document);
      }
    }
  }

  for (const root of rootsToScan) {
    scheduleScan(root);
  }
});

if (document.body) {
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true
  });
}

// Recalculate gift card page when amount changes.
document.addEventListener("click", event => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.closest("button, label, input")) {
    scheduleScan();
  }
}, true);

let lastUrl = location.href;

function onUrlChange() {
  if (location.href === lastUrl) return;
  lastUrl = location.href;

  // Clear product-page badges when moving between PDP/grid.
  document.querySelectorAll(".tph-product-badge").forEach(el => el.remove());

  scheduleRetryScans();
}

const originalPushState = history.pushState;
history.pushState = function (...args) {
  originalPushState.apply(this, args);
  onUrlChange();
};

const originalReplaceState = history.replaceState;
history.replaceState = function (...args) {
  originalReplaceState.apply(this, args);
  onUrlChange();
};

window.addEventListener("popstate", onUrlChange);
window.addEventListener("load", () => scheduleRetryScans());
window.addEventListener("pageshow", () => scheduleRetryScans());