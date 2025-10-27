# Site Readiness Auditor Chrome Extension

Site Readiness Auditor is a Chrome extension that evaluates a page's performance, crawlability, GEO/LLM readiness, accessibility, and infinite scroll patterns. It combines DOM heuristics with network-level fetches to produce an overall readiness score and actionable recommendations.

![Alt text](/screen_shot.png?raw=true "Optional Title")

## Features

- **Performance heuristics** – Observes Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS), and Interaction to Next Paint (INP), scores them with Lighthouse Core Web Vitals curves, and inspects resource hints, compression, caching, and image/font usage. 【F:content.js†L213-L348】【F:popup.js†L609-L713】【F:lighthouse_metrics.js†L1-L118】
- **SEO and structured data checks** – Validates sitemap discoverability, canonical tags, title/meta description length, and JSON-LD presence. 【F:popup.js†L454-L515】
- **GEO / LLM readiness** – Fetches `robots.txt`, `ai.txt`, `llms.txt`, and evaluates whether major AI crawlers are allowed, while reporting AI policy directives that block ingestion. 【F:service_worker.js†L220-L423】【F:popup.js†L421-L487】
- **GEO content deep dive** – Captures word counts, readability, structure, outbound references, quotes, and stats for the detailed report view. 【F:content.js†L19-L203】【F:report.js†L962-L1033】
- **Accessibility highlights** – Ensures a single `<h1>`, checks for missing `alt` text, verifies `<html lang>` usage, and evaluates content depth. 【F:content.js†L10-L42】【F:popup.js†L515-L542】
- **Infinite scroll readiness** – Detects infinite scroll behavior, ensures crawlable pagination URLs exist, and verifies that fetching a “page 2” URL returns content. 【F:content.js†L349-L466】【F:service_worker.js†L286-L423】【F:popup.js†L713-L756】
- **Shareable reports** – Saves the latest audit to `chrome.storage.local`, renders a detailed report page, and preserves raw data for debugging. 【F:popup.js†L62-L86】【F:report.js†L1-L120】

## How it Works

1. **Popup trigger** – Clicking **Run audit** in `popup.html` wakes the background service worker and queries the active tab. 【F:popup.js†L25-L86】
2. **DOM collection** – The content script (`content.js`) listens for `COLLECT_DOM_INFO`, gathers metadata and in-page signals, and simulates a scroll to detect dynamically injected content. 【F:content.js†L1-L70】
3. **Network collection** – The service worker (`service_worker.js`) fetches site-level resources (robots, sitemap, AI policies) and infers pagination patterns from discovered sitemap URLs. 【F:service_worker.js†L33-L364】
4. **Scoring** – The popup combines DOM and network snapshots into five weighted category scores (GEO 35, SEO 25, A11y 10, Performance 20, Infinite 10), derives an overall grade, and lists key checks plus prioritized recommendations. 【F:popup.js†L421-L756】【F:popup.js†L807-L916】
5. **Reporting** – Results are persisted under a random key. The **Open full report** button launches `report.html`, which formats category cards, pagination diagnostics, and raw JSON. 【F:popup.js†L62-L86】【F:report.js†L53-L120】

## Scoring System Deep Dive

The overall readiness score is the weighted sum of five categories. Each category grants points when a check passes; failing checks log guidance and may trigger recommendations. Scores are capped at their category maximums before computing the overall grade (`A ≥ 90`, `B ≥ 80`, `C ≥ 70`, `D ≥ 60`, otherwise `F`). 【F:popup.js†L24-L37】【F:popup.js†L695-L735】

| Category | Max Points | Focus |
| --- | --- | --- |
| GEO / LLM | 35 | Crawl permissions for AI agents and AI policy declarations |
| SEO | 25 | Discoverability, canonicalization, and snippet hygiene |
| Accessibility | 10 | Semantic headings, alt text, language, and content depth |
| Performance | 20 | Core Web Vitals + delivery optimizations |
| Infinite Scroll | 10 | Crawl-friendly pagination for infinite feeds |

### GEO / LLM (35 pts)

The extension inspects AI policy endpoints and `robots.txt` allowances for leading AI crawlers. Passing each signal adds its weight to the GEO score:

* **`ai.txt` reachable (8 pts)** – Confirms `ai.txt` responds with text so you can publish AI usage guidance. Missing or non-text responses lose the points and escalate a high-severity recommendation. 【F:popup.js†L468-L485】
* **`llms.txt` reachable (5 pts)** – Mirrors the `ai.txt` check for long-form licensing statements. 【F:popup.js†L487-L503】
* **Major AI bots not blocked** – Each bot contributes points when not disallowed in `robots.txt`: GPTBot (8), CommonCrawl (6), ClaudeBot (4), PerplexityBot (2), and Google-Extended (2). Blocking any bot flips the status to “bad” and surfaces remediation language. 【F:popup.js†L505-L542】
* **AI reuse directives (0 pts, penalty logic)** – `noai` directives in headers or meta tags do not award points and subtract up to 6 pts from the GEO subtotal, reflecting the trade-off of prohibiting AI ingestion. 【F:popup.js†L544-L567】【F:popup.js†L612-L616】

#### How GEO readiness is measured

1. **Policy fetch sequence** – The background service worker issues direct requests for `robots.txt`, `ai.txt`, and `llms.txt`, follows redirects, and rejects HTML responses so only plain-text policies are considered valid before returning the results to the popup. 【F:service_worker.js†L26-L117】【F:service_worker.js†L393-L417】【F:popup.js†L431-L487】
2. **Crawler permission matrix** – `parseRobots` distills the fetched `robots.txt` into allow/deny flags for GPTBot, CommonCrawl, ClaudeBot, PerplexityBot, and Google-Extended. The popup uses those booleans to grade GEO exposure and award points for every crawler that is not disallowed. 【F:service_worker.js†L146-L201】【F:popup.js†L505-L542】
3. **Policy presence scoring** – The popup assigns eight points for a valid `ai.txt` response and five points for a valid `llms.txt`, while attaching remediation text if either endpoint is missing or misconfigured. Status codes, final URLs, and `Content-Type` headers are surfaced so teams can diagnose server-side issues. 【F:service_worker.js†L393-L417】【F:popup.js†L431-L503】
4. **In-page directive penalties** – The content script captures meta robots directives and the popup inspects both header- and meta-level `noai` rules. Any prohibition subtracts up to six points and records the directive’s source in the GEO findings list. 【F:content.js†L1-L45】【F:popup.js†L544-L571】
5. **Content depth analysis** – Beyond permissions, the DOM snapshot quantifies GEO-focused copy signals such as word counts, top terms, readability, structure, citations, and evidence. The full report renders those measurements alongside the GEO findings so reviewers can judge topical readiness. 【F:content.js†L28-L128】【F:report/geo.js†L1-L109】
6. **Severity mapping** – GEO findings are converted into recommendations ranked by severity, ensuring blocks on major crawlers surface ahead of optional improvements like publishing policy files. 【F:popup.js†L724-L792】

### SEO (25 pts)

SEO checks target baseline discoverability signals:

* **Sitemap discoverable (6 pts)** – Verifies `robots.txt` references a sitemap or `/sitemap.xml` exists. Missing discovery hints is high severity because many downstream checks rely on sitemaps. 【F:popup.js†L443-L457】
* **Indexing allowed (6 pts)** – Flags `noindex` directives in either `X-Robots-Tag` headers or `<meta name="robots">` tags. Removing blockers restores the points. 【F:popup.js†L553-L566】
* **Structured data present (5 pts)** – Awards points when at least one JSON-LD block exists. 【F:popup.js†L568-L571】
* **Canonical URL defined (3 pts)** – Looks for `<link rel="canonical">` to avoid duplicate-index issues. 【F:popup.js†L573-L576】
* **Title length 10–70 chars (3 pts)** – Ensures the title is concise yet descriptive. 【F:popup.js†L578-L582】
* **Meta description 50–160 chars (2 pts)** – Validates snippet-length guidance for SERP previews. 【F:popup.js†L584-L588】

### Accessibility (10 pts)

Accessibility scoring focuses on quick heuristics drawn from the DOM snapshot:

* **Exactly one `<h1>` (3 pts)** – Reports excess or missing primary headings. 【F:popup.js†L590-L594】
* **All images have `alt` text (3 pts)** – Counts missing alt attributes. 【F:popup.js†L596-L600】
* **`<html lang>` set (2 pts)** – Verifies the document language for assistive technologies. 【F:popup.js†L602-L605】
* **≥300 words in main content (2 pts)** – Encourages substantive text for screen readers and SEO alike. 【F:popup.js†L607-L611】

### Performance (20 pts)

Performance points blend Lighthouse’s Core Web Vitals curves with delivery heuristics. Lighthouse metrics accumulate up to their assigned weights (`LCP` 10, `CLS` 4, `INP` 6). Additional heuristics grant points when best practices are detected; the total is clamped to 20 so Lighthouse performance remains the primary driver. 【F:popup.js†L618-L703】

* **Core Web Vitals** – Uses `scoreWebVitals` to translate raw measurements into Lighthouse-style buckets, logging the measured value and percentile references. Failing metrics add targeted tuning advice. 【F:popup.js†L618-L655】【F:lighthouse_metrics.js†L1-L118】
* **Compression enabled (5 pts)** – Requires `Content-Encoding` of `br`, `gzip`, or `zstd` on the root response. 【F:popup.js†L657-L662】
* **Cache headers present (5 pts)** – Looks for `Cache-Control` with `max-age ≥ 1000`. 【F:popup.js†L664-L667】
* **Resource hints (3 pts each)** – Detects `<link rel="preconnect">` and `<link rel="preload">` usage for critical origins/assets. 【F:popup.js†L669-L676】
* **Modern image formats (2 pts)** – Awards points when ≥70% of images use WebP/AVIF. 【F:popup.js†L678-L683】
* **Lazy-loading adoption (1 pt)** – Checks for `loading="lazy"` on ≥70% of non-critical images. 【F:popup.js†L685-L689】
* **`font-display` usage (1 pt)** – Confirms custom fonts declare `font-display`. 【F:popup.js†L691-L694】

### Infinite Scroll & Pagination (10 pts)

Infinite scroll audits ensure feed-style pages remain crawlable:

* **Crawlable pagination present (7 pts)** – Requires discoverable pagination links and a successful network fetch of “page 2”. Works for both traditional and infinite-loading pages. 【F:popup.js†L700-L709】
* **Pagination visible or hinted (3 pts)** – Accepts either visible controls or `<link rel="next/prev">` hints. 【F:popup.js†L711-L716】
* **Behavior descriptor (0 pts)** – Notes whether infinite scroll was observed during simulated scrolling. 【F:popup.js†L718-L722】

### Recommendations and Key Checks

Every failed check logs a short recommendation with category and severity. The popup shows the top 12 key checks (ordered by severity) plus a deduplicated recommendation list to help prioritize fixes across multiple audited pages. 【F:popup.js†L37-L74】【F:popup.js†L724-L792】【F:popup.js†L804-L856】

### Multi-page Aggregation

When auditing multiple URLs, scores and category items are averaged and merged. Each item is annotated with the originating page label, and recommendations consolidate identical fixes across sources. Lighthouse metrics from the first page are reused for context. 【F:popup.js†L180-L276】

## Installation (Developer Mode)

Follow these steps to load the extension locally for exploratory or regression testing:

1. **Retrieve the code** – Clone the repository or download the ZIP archive and extract it to a convenient folder on your machine (e.g., `~/geo-seo-site-readiness-extension`).
2. **Open Chrome's extension dashboard** – In a Chromium-based browser, navigate to `chrome://extensions/` and ensure a fresh window is open for the site you plan to audit.
3. **Enable developer tools** – Toggle **Developer mode** in the top-right corner of the extensions dashboard so Chrome will accept unpacked sources.
4. **Load the unpacked project** – Click **Load unpacked**, browse to the folder from step 1, and select it. The extension should now appear in the list; pin it to the toolbar if you want quick access during testing.
5. **Refresh after code edits** – While iterating on changes, use the **↻ Reload** button on the extension card to pull in your latest modifications before re-running tests.

## Running an Audit

1. Navigate to any HTTP/HTTPS web page.
2. Click the extension icon and press **Run audit**.
3. Review the summarized score, category breakdown, and recommendations in the popup.
4. (Optional) Click **Open full report** to inspect the detailed report and raw JSON snapshot.

## Storage and Privacy

- Audits are stored only in `chrome.storage.local` on your machine and are keyed by a random identifier. 【F:popup.js†L62-L86】
- No data leaves your browser; all fetches are performed against the audited site from the background service worker. 【F:service_worker.js†L221-L364】

## Development Notes

- The codebase avoids optional chaining/nullish coalescing in popup/report scripts to stay compatible with older Chromium builds. 【F:popup.js†L1-L7】【F:report.js†L1-L3】
- Background tasks run in `service_worker.js`, while UI logic lives in `popup.js` and `report.js`. Content inspection is isolated in `content.js`.
- To debug background fetches, open `chrome://extensions`, locate **Site Readiness Auditor**, and inspect the service worker console.

