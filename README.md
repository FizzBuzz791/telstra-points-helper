# Telstra Points Helper

A lightweight Chrome/Edge Manifest V3 browser extension that calculates and displays the cents-per-point (cpp) value on Telstra Plus Rewards product cards and detail pages.

## Overview

When browsing [Telstra Plus Rewards](https://plus.telstra.com.au/rewards/explore/all-products), this extension adds a badge to each product showing how many cents you get per point redeemed.

**Formula:** `cpp = (cash_value / points_required) × 100`

**Example:** $349 / 144,200 pts = **0.24 cpp**

## Badge Ratings

The badge color indicates value:

- 🟢 **Excellent:** ≥0.30 cpp (best value)
- 🟡 **Good:** ≥0.25 cpp
- 🟠 **OK:** ≥0.20 cpp
- 🔴 **Poor:** <0.20 cpp (lower value)

## Installation

### Chrome/Edge (Unpacked Extension)

1. Clone or download this repository
2. Open your browser and navigate to:
   - **Chrome:** `chrome://extensions/`
   - **Edge:** `edge://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the `src/` directory from this repository

The extension is now active on Telstra Rewards pages.

## How It Works

- Automatically detects Telstra Plus Rewards product pages (grid and detail views)
- Extracts points required and cash value from product text
- Calculates cpp and displays a color-coded badge on each product
- Adds a lightweight filter bar on catalogue pages (All, Scored, >=0.25, >=0.30)
- Works on grid pages, product detail pages, and gift cards
- Handles SPA navigation and page refreshes

## Testing

Run the test suite:

```bash
npm install
npm test                # Unit tests on sample HTML
npm run test:visual     # Generate visual snapshots from live Telstra site
```

## Files

- `src/manifest.json` – MV3 extension manifest
- `src/content.js` – Content script that runs on Telstra pages
- `src/styles.css` – Badge styling
- `tests/` – Test suite and samples

## License

Personal use. Feel free to modify and distribute as needed.
