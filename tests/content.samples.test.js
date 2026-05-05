const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fssync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const CONTENT_SCRIPT_PATH = path.join(ROOT, 'src', 'content.js');
const SAMPLES_DIR = path.join(ROOT, 'tests', 'samples');
const SNAPSHOT_PATH = path.join(ROOT, 'tests', '__snapshots__', 'content.samples.snapshot.json');
const UPDATE_SNAPSHOTS = process.env.UPDATE_SNAPSHOTS === '1';
let contentScriptCache = null;
const recordedSnapshots = new Map();

const CARD_SELECTOR = 'li.tplus-rewards-product-tile';
const POINTS_REGEX = /([\d,]+)\s*pts/i;
const CASH_OR_REGEX = /or\s*\$([\d,]+(?:\.\d{1,2})?)/i;

function toNumber(value) {
  return Number(value.replace(/,/g, ''));
}

function getCardOwnedBadges(card) {
  return Array.from(card.querySelectorAll('.tph-wrapper')).filter(
    badge => badge.closest(CARD_SELECTOR) === card
  );
}

function normalizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function snapshotCardBadge(card, index) {
  const badges = getCardOwnedBadges(card);
  if (!badges.length) {
    return null;
  }

  return {
    index,
    count: badges.length,
    badges: badges.map(badge => ({
      text: normalizeText(badge.querySelector('.tph-badge')?.textContent),
      detail: normalizeText(badge.querySelector('.tph-detail')?.textContent),
      rating: ['tph-excellent', 'tph-good', 'tph-ok', 'tph-poor'].find(cls => badge.classList.contains(cls)) || null
    }))
  };
}

function recordSnapshot(name, value) {
  recordedSnapshots.set(name, value);
}

after(async () => {
  const actual = Object.fromEntries(Array.from(recordedSnapshots.entries()).sort(([a], [b]) => a.localeCompare(b)));
  const hasExistingSnapshot = fssync.existsSync(SNAPSHOT_PATH);

  if (UPDATE_SNAPSHOTS || !hasExistingSnapshot) {
    await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
    await fs.writeFile(SNAPSHOT_PATH, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
    return;
  }

  const expected = JSON.parse(await fs.readFile(SNAPSHOT_PATH, 'utf8'));
  assert.deepEqual(actual, expected, `snapshot mismatch for ${SNAPSHOT_PATH}`);
});

async function readContentScript() {
  if (!contentScriptCache) {
    contentScriptCache = await fs.readFile(CONTENT_SCRIPT_PATH, 'utf8');
  }

  return contentScriptCache;
}

async function loadSampleDom(sampleFileName, pagePath) {
  const html = await fs.readFile(path.join(SAMPLES_DIR, sampleFileName), 'utf8');

  const dom = new JSDOM(html, {
    url: `https://plus.telstra.com.au${pagePath}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });

  const { window } = dom;

  if (!window.requestIdleCallback) {
    window.requestIdleCallback = callback =>
      window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 0);
  }

  return dom;
}

async function runContentScript(dom) {
  const contentScript = await readContentScript();
  dom.window.eval(contentScript);

  // Let scheduled scans settle and run delayed retries.
  await new Promise(resolve => dom.window.setTimeout(resolve, 1800));
}

test('all-products-grid sample: eligible cards get one correct badge each', async () => {
  const dom = await loadSampleDom('telstraplus-all-products-grid.html', '/rewards/explore/all-products');
  const { document } = dom.window;

  const cards = Array.from(document.querySelectorAll(CARD_SELECTOR));
  assert.ok(cards.length > 0, 'expected product cards in grid sample');

  const baselineBadgeCount = new Map(cards.map(card => [card, getCardOwnedBadges(card).length]));

  await runContentScript(dom);

  const { scan } = dom.window;

  const eligibleCards = cards.filter(card => {
    const text = card.textContent || '';
    return POINTS_REGEX.test(text) && CASH_OR_REGEX.test(text);
  });
  assert.ok(eligibleCards.length > 0, 'expected at least one eligible card with points and cash');

  const ineligibleCards = cards.filter(card => !eligibleCards.includes(card));

  for (const card of eligibleCards) {
    const text = card.textContent || '';
    const pointsMatch = text.match(POINTS_REGEX);
    const cashMatch = text.match(CASH_OR_REGEX);

    assert.ok(pointsMatch, 'expected points match');
    assert.ok(cashMatch, 'expected cash match');

    const points = toNumber(pointsMatch[1]);
    const cash = toNumber(cashMatch[1]);
    const expectedCppText = `${((cash / points) * 100).toFixed(2)} cpp`;

    const baseline = baselineBadgeCount.get(card) || 0;
    const badges = getCardOwnedBadges(card);

    if (baseline > 0) {
      assert.equal(
        badges.length,
        baseline,
        'pre-annotated card should not gain additional badges'
      );
    } else {
      assert.equal(badges.length, 1, 'eligible unannotated card should get exactly one badge');
    }

    const badgeTexts = badges
      .map(badge => (badge.querySelector('.tph-badge')?.textContent || '').trim());

    if (baseline === 0) {
      assert.ok(
        badgeTexts.includes(expectedCppText),
        'newly created badge should match expected cpp text'
      );
    } else {
      assert.ok(
        badgeTexts.some(text => /^\d+\.\d{2}\s+cpp$/i.test(text)),
        'pre-annotated card should still contain a valid cpp badge label'
      );
    }
  }

  for (const card of ineligibleCards) {
    const baseline = baselineBadgeCount.get(card) || 0;
    const badges = getCardOwnedBadges(card);
    assert.equal(
      badges.length,
      baseline,
      'ineligible card should not receive new badges'
    );
  }

  const beforeRescan = new Map(cards.map(card => [card, getCardOwnedBadges(card).length]));

  if (typeof scan === 'function') {
    scan(document);
    scan(document);
  }

  for (const card of eligibleCards) {
    const before = beforeRescan.get(card) || 0;
    const badges = getCardOwnedBadges(card);
    assert.equal(badges.length, before, 'rescan should not duplicate card badges');
  }

  const cardSnapshots = cards
    .map((card, index) => snapshotCardBadge(card, index))
    .filter(Boolean);

  recordSnapshot('all-products-grid', {
    cardCount: cards.length,
    eligibleCardCount: eligibleCards.length,
    ineligibleCardCount: ineligibleCards.length,
    cardsWithBadges: cardSnapshots
  });

});

test('product-page sample shell: no false-positive product badge', async () => {
  const dom = await loadSampleDom('telstraplus-product-page.html', '/rewards/explore/sample-product');
  await runContentScript(dom);
  const { document } = dom.window;

  const productBadges = document.querySelectorAll('.tph-product-badge');
  assert.equal(productBadges.length, 0, 'shell source should not produce product badge without data');

  recordSnapshot('product-page-shell', {
    productBadgeCount: productBadges.length,
    productBadgeTexts: Array.from(productBadges).map(badge => normalizeText(badge.textContent))
  });

});

test('gift-card sample shell: no false-positive product badge', async () => {
  const dom = await loadSampleDom('telstraplus-gift-card.html', '/rewards/explore/sample-gift-card');
  await runContentScript(dom);
  const { document } = dom.window;

  const productBadges = document.querySelectorAll('.tph-product-badge');
  assert.equal(productBadges.length, 0, 'shell source should not produce product badge without data');

  recordSnapshot('gift-card-shell', {
    productBadgeCount: productBadges.length,
    productBadgeTexts: Array.from(productBadges).map(badge => normalizeText(badge.textContent))
  });

});

test('product-offer sample shell: no false-positive product badge', async () => {
  const dom = await loadSampleDom('telstraplus-product-offer.html', '/rewards/explore/sample-product-offer');
  await runContentScript(dom);
  const { document } = dom.window;

  const productBadges = document.querySelectorAll('.tph-product-badge');
  assert.equal(productBadges.length, 0, 'shell source should not produce product badge without data');

  recordSnapshot('product-offer-shell', {
    productBadgeCount: productBadges.length,
    productBadgeTexts: Array.from(productBadges).map(badge => normalizeText(badge.textContent))
  });

});
