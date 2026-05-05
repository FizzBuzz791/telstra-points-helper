# Telstra Points Helper - Copilot Instructions

## Goal

Build a lightweight Chrome/Edge Manifest V3 browser extension for Telstra Plus Rewards.

The extension calculates and displays cents-per-point value for Telstra Rewards catalogue cards and product detail pages.

Formula:

cpp = (cash_value / points_required) \* 100

Example:

$349 / 144,200 pts \* 100 = 0.24 cpp

## Current problem

The extension currently works on individual product pages but does not reliably work on the main rewards grid. Recent fixes also caused performance regressions.

Current implementation details:

- `content.js` uses `li.tplus-rewards-product-tile` as the grid card selector.
- It parses `pts`, `or $`, and gift-card values with regex.
- It uses `MutationObserver`.
- It detects SPA route changes by patching `history.pushState` and `history.replaceState`.
- It has separate catalogue-card and product-page logic.

The current `content.js` is the source of truth for current state.

## Important constraints

Prioritise performance.

Avoid scanning the full document repeatedly.

Avoid broad selectors like:

document.querySelectorAll("div, article, li")

Avoid repeatedly reading `document.body.textContent` except on product detail pages, and only when necessary.

Avoid inserting more than one badge per card or product page.

Do not use React, build tooling, or dependencies unless absolutely necessary. Keep this as a plain MV3 extension.

## Known DOM facts

### Catalogue/grid page

Grid product cards use:

li.tplus-rewards-product-tile

A valid product card usually contains text like:

144,200 pts
or $349

Catalogue gift-card tiles may contain text like:

From 6,300 pts

Do not calculate catalogue gift-card tiles unless a matching dollar value is present in the same card.

### Product detail page

Product detail pages use SPA routes like:

/rewards/explore/:product

Product pages may show:

144,200 pts
or $349

Gift-card product pages may show:

$50 eGift Card
31,900 pts

or:

Gift card amount: $50
31,900 pts

Product pages should show exactly one badge.

## Desired architecture

Use a small set of targeted functions:

parsePoints(text)
parseCash(text)
calculateCpp(points, cash)
createBadge(points, cash)
annotateCatalogueCard(card)
annotateProductPage()
scanCatalogue(root)
scanProductPage()
scheduleScan(reason, root)

## Performance strategy

### Grid page

Use a two-stage approach:

1. Detect or observe product cards.
2. Annotate only visible or near-visible cards.

Preferred approach:

- Use `MutationObserver` only to discover new `li.tplus-rewards-product-tile` elements.
- Use `IntersectionObserver` to annotate cards only when near viewport.
- Use `WeakSet` to avoid re-observing or re-processing cards.
- Do not scan the full document on every mutation.

Pseudo-flow:

const cardObserver = new IntersectionObserver(entries => {
for (const entry of entries) {
if (!entry.isIntersecting) continue;
annotateCatalogueCard(entry.target);
cardObserver.unobserve(entry.target);
}
}, {
rootMargin: "600px 0px",
threshold: 0
});

Then:

function observeCatalogueCard(card) {
if (seenCards.has(card)) return;
if (card.querySelector(".tph-wrapper")) return;
cardObserver.observe(card);
}

### MutationObserver

The mutation observer should be narrow:

const observer = new MutationObserver(mutations => {
for (const mutation of mutations) {
for (const node of mutation.addedNodes) {
if (!(node instanceof HTMLElement)) continue;

      if (node.matches?.(CARD_SELECTOR)) {
        observeCatalogueCard(node);
        continue;
      }

      node.querySelectorAll?.(CARD_SELECTOR).forEach(observeCatalogueCard);
    }

}
});

Avoid testing every added node’s full `textContent` on the grid. That likely contributed to lag.

### SPA navigation

Telstra is an SPA, so handle route changes.

Patch:

history.pushState
history.replaceState
window.popstate

On route change:

- Remove `.tph-product-badge`.
- Clear scheduled product-page retry timers.
- Run a few delayed lightweight scans:
  - immediately
  - 300ms
  - 1000ms

For grid pages, route scans should register or observe cards, not annotate the full catalogue immediately.

## Badge behaviour

Use classes:

tph-wrapper
tph-badge
tph-detail
tph-product-badge
tph-excellent
tph-good
tph-ok
tph-poor

Rating thresholds:

if (cpp >= 0.30) return "excellent";
if (cpp >= 0.25) return "good";
if (cpp >= 0.20) return "ok";
return "poor";

Badge text:

0.24 cpp

Tooltip:

$349.00 / 144,200 points

## Parsing rules

Use conservative parsing.

Catalogue card:

points = card text matching /([\d,]+)\s*pts/i
cash = card text matching /or\s*\$([\d,]+(?:\.\d{1,2})?)/i

If either is missing, skip.

Product detail page:

Try cash in this order:

/or\s*\$([\d,]+(?:\.\d{1,2})?)/i
/gift card amount:\s*\$([\d,]+(?:\.\d{1,2})?)/i
/\$([\d,]+(?:\.\d{1,2})?)\s\*e?gift card/i

Points:

/([\d,]+)\s\*pts/i

## Acceptance criteria

1. Main grid shows one badge per visible product card.
2. Scrolling down causes newly visible cards to get badges.
3. Product detail pages show exactly one badge.
4. Gift-card product pages calculate correctly, for example `$50 / 31,900 pts = 0.16 cpp`.
5. Going from grid to product and back to grid still shows grid badges.
6. CPU usage remains low during initial page load and scrolling.
7. No duplicate badges.
8. No full-document rescans on every mutation.

## Debugging helpers

Add temporary debug logs behind a flag:

const DEBUG = false;

function debug(...args) {
if (DEBUG) console.debug("[Telstra Points Helper]", ...args);
}

Useful logs:

debug("observed card", card);
debug("annotated card", { points, cash, cpp });
debug("route changed", location.href);
debug("product page parse", { points, cash });

## Suggested next implementation step

Refactor `content.js` so that:

- catalogue/grid uses `IntersectionObserver`
- product detail pages use direct single-badge logic
- `MutationObserver` only discovers cards and triggers product-page retries
- `document.body.textContent` is only used inside product detail parsing

Do not keep layering fixes on the current observer. Simplify it.

## Task Completion

When closing off a task, create:

- a concise commit message summarizing the change.
- a PR description in markdown format within 4000 characters.

Output both in a strict copy-paste template format:

Commit message:

```text
<single-line commit message>
```

PR description:

```markdown
## Summary

<brief summary of the change>

## Context

<relevant context or reasoning behind the change>

## Related

<related issues, tasks, or N/A>

## Validation

- <validation step performed>

## Follow-up

- [ ] <remaining work if any>
- [ ] <otherwise write None as a single checklist item>
```

Formatting requirements for task close-out output:

- Keep `Commit message:` and `PR description:` titles outside of fenced blocks.
- Put the commit message in its own fenced `text` code block.
- Put the PR description in its own fenced `markdown` code block.
- Keep the commit message to a single line.
- Keep the PR description as raw markdown inside its own code block.
- If a section has no content, write `N/A` instead of omitting the section.
