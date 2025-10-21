# Site Readiness Auditor Chrome Extension

Site Readiness Auditor is a Chrome extension that evaluates a page's performance, crawlability, AI/LLM readiness, accessibility, and infinite scroll patterns. It combines DOM heuristics with network- level fetches to produce an overall readiness score and actionable suggestions.

## Features

- **Performance heuristics** – Observes Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS), and Interaction to Next Paint (INP) from the current page, inspects resource hints, compression, caching, and image/font usage. 【F:content.js†L23-L70】【F:popup.js†L108-L174】
- **SEO and structured data checks** – Validates sitemap discoverability, canonical tags, title/meta description length, JSON-LD presence, and OpenGraph/Twitter metadata. 【F:popup.js†L100-L154】
- **LLM policy awareness** – Fetches `robots.txt`, `ai.txt`, `llms.txt`, and evaluates whether major AI crawlers are allowed via robots directives or `X-Robots-Tag` headers. 【F:service_worker.js†L221-L285】【F:popup.js†L88-L134】
- **Accessibility highlights** – Ensures a single `<h1>`, checks for missing `alt` text, verifies `<html lang>` usage, and evaluates content depth. 【F:content.js†L10-L42】【F:popup.js†L155-L166】
- **Infinite scroll readiness** – Detects infinite scroll behavior, ensures crawlable pagination URLs exist, and verifies that fetching a “page 2” URL returns content. 【F:content.js†L43-L70】【F:service_worker.js†L286-L364】【F:popup.js†L175-L197】
- **Shareable reports** – Saves the latest audit to `chrome.storage.local`, renders a detailed report page, and preserves raw data for debugging. 【F:popup.js†L62-L86】【F:report.js†L1-L120】

## How it Works

1. **Popup trigger** – Clicking **Run audit** in `popup.html` wakes the background service worker and queries the active tab. 【F:popup.js†L25-L86】
2. **DOM collection** – The content script (`content.js`) listens for `COLLECT_DOM_INFO`, gathers metadata and in-page signals, and simulates a scroll to detect dynamically injected content. 【F:content.js†L1-L70】
3. **Network collection** – The service worker (`service_worker.js`) fetches site-level resources (robots, sitemap, AI policies) and infers pagination patterns from discovered sitemap URLs. 【F:service_worker.js†L33-L364】
4. **Scoring** – The popup combines DOM and network snapshots into five category scores, derives an overall grade, and lists key checks plus suggestions. 【F:popup.js†L88-L197】
5. **Reporting** – Results are persisted under a random key. The **Open full report** button launches `report.html`, which formats category cards, pagination diagnostics, and raw JSON. 【F:popup.js†L62-L86】【F:report.js†L53-L120】

## Installation (Developer Mode)

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and choose the repository folder.

## Running an Audit

1. Navigate to any HTTP/HTTPS web page.
2. Click the extension icon and press **Run audit**.
3. Review the summarized score, category breakdown, and suggestions in the popup.
4. (Optional) Click **Open full report** to inspect the detailed report and raw JSON snapshot.

## Storage and Privacy

- Audits are stored only in `chrome.storage.local` on your machine and are keyed by a random identifier. 【F:popup.js†L62-L86】
- No data leaves your browser; all fetches are performed against the audited site from the background service worker. 【F:service_worker.js†L221-L364】

## Development Notes

- The codebase avoids optional chaining/nullish coalescing in popup/report scripts to stay compatible with older Chromium builds. 【F:popup.js†L1-L7】【F:report.js†L1-L3】
- Background tasks run in `service_worker.js`, while UI logic lives in `popup.js` and `report.js`. Content inspection is isolated in `content.js`.
- To debug background fetches, open `chrome://extensions`, locate **Site Readiness Auditor**, and inspect the service worker console.

