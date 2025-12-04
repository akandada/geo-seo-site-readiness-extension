import { renderOverallGauge, renderFindingBreakdown, renderScoreChart } from "./report/charts.js";
import { $, cardEl, fillChips, parseQuery } from "./report/dom.js";
import { formatDurationSeconds } from "./report/formatters.js";
import { renderGeoDeepDive } from "./report/geo.js";
import { renderLighthouseCard } from "./report/lighthouse.js";
import { renderMediaInventory } from "./report/inventory.js";
import { renderGtmInventory } from "./report/gtm.js";
import { renderMultiPageList } from "./report/multiPage.js";
import { renderRecommendations } from "./report/recommendations.js";

function updateCharts(data, overallScore) {
  var chartDashboardCard = $("chartDashboardCard");
  var chartPanelsVisible = false;

  var gaugeCanvas = $("overallGaugeCanvas");
  var gaugeCard = $("overallGaugeCard");
  var gaugeEmpty = $("overallGaugeEmpty");
  if (gaugeCanvas && gaugeCard) {
    if (overallScore != null && overallScore === overallScore) {
      gaugeCard.style.display = "block";
      chartPanelsVisible = true;
      if (gaugeEmpty) gaugeEmpty.style.display = "none";
      if (!gaugeCanvas.__rerenderFn) {
        gaugeCanvas.__rerenderFn = function(){
          renderOverallGauge(gaugeCanvas, gaugeCanvas.__scoreValue);
        };
        window.addEventListener("resize", gaugeCanvas.__rerenderFn);
      }
      gaugeCanvas.__scoreValue = overallScore;
      gaugeCanvas.__rerenderFn();
    } else {
      gaugeCard.style.display = "block";
      chartPanelsVisible = true;
      if (gaugeEmpty) gaugeEmpty.style.display = "block";
    }
  }

  var catMap = [
    {
      title: "GEO / LLM Readiness",
      cat: data.categories && data.categories.geo,
      helper: "Out of 22 points based on AI crawler permissions, policy file availability, and penalties for noai directives."
    },
    {
      title: "Crawlability & SEO",
      cat: data.categories && data.categories.seo,
      helper: "Max 25 points for sitemap discovery, indexability, structured data, canonical tags, and healthy title/description lengths."
    },
    {
      title: "Answer Engine Optimization",
      cat: data.categories && data.categories.answer,
      helper: "Up to 20 points awarded for FAQ/HowTo schema, speakable markup, question modules, summaries, and authoritative citations."
    },
    {
      title: "Accessibility & Semantics",
      cat: data.categories && data.categories.a11y,
      helper: "Scores to 20 points by checking a single <h1>, alt text coverage, declared html lang, and ≥300-word content depth."
    },
    {
      title: "Performance",
      cat: data.categories && data.categories.performance,
      helper: "Capped at 35 points combining Lighthouse Core Web Vitals with bonuses for compression, caching, resource hints, modern image formats, lazy loading, and font-display."
    },
    {
      title: "Infinite Scroll Pattern",
      cat: data.categories && data.categories.infinite,
      helper: "Worth up to 10 points for crawlable pagination URLs, successful page-2 fetches, and visible or hinted pagination controls."
    }
  ];

  var container = $("categoryCards");
  if (container) {
    container.innerHTML = "";
    var chartCanvas = $("scoreChartCanvas");
    var chartCard = $("scoreChartCard");
    var chartEmpty = $("scoreChartEmpty");
    var chartData = [];

    catMap.forEach(function(entry){
      var title = entry.title;
      var cat = entry.cat;
      if (!cat) return;
      container.appendChild(cardEl(title, cat.score, cat.items, entry.helper));
      if (cat.score != null) {
        var num = Number(cat.score);
        if (num === num) {
          chartData.push({ title: title, score: num });
        }
      }
    });

    if (chartCanvas && chartCard) {
      chartCard.style.display = "block";
      chartPanelsVisible = true;
      if (chartEmpty) {
        chartEmpty.style.display = chartData.length ? "none" : "block";
      }
      if (!chartCanvas.__rerenderFn) {
        chartCanvas.__rerenderFn = function(){
          var payload = chartCanvas.__chartData || [];
          renderScoreChart(chartCanvas, payload);
        };
        window.addEventListener("resize", chartCanvas.__rerenderFn);
      }
      chartCanvas.__chartData = chartData;
      chartCanvas.__rerenderFn();
    }

    var breakdownCanvas = $("findingBreakdownCanvas");
    var breakdownCard = $("findingBreakdownCard");
    var breakdownEmpty = $("findingBreakdownEmpty");
    var breakdownLegend = $("findingBreakdownLegend");
    if (breakdownCanvas && breakdownCard) {
      var counts = { ok: 0, warn: 0, bad: 0, info: 0 };
      for (var ci = 0; ci < catMap.length; ci++) {
        var catEntry = catMap[ci].cat;
        var items = catEntry && catEntry.items ? catEntry.items : [];
        for (var ii = 0; ii < items.length; ii++) {
          var item = items[ii];
          var state = item && item.state ? item.state : "info";
          if (state !== "ok" && state !== "warn" && state !== "bad") {
            state = "info";
          }
          counts[state] += 1;
        }
      }

      var breakdownData = [];
      if (counts.ok > 0) breakdownData.push({ label: "Positive", value: counts.ok, color: "#2aa745" });
      if (counts.warn > 0) breakdownData.push({ label: "Warnings", value: counts.warn, color: "#e3a008" });
      if (counts.bad > 0) breakdownData.push({ label: "Issues", value: counts.bad, color: "#e63946" });
      if (counts.info > 0) breakdownData.push({ label: "Informational", value: counts.info, color: "#5ca2ff" });

      if (breakdownData.length) {
        breakdownCard.style.display = "block";
        chartPanelsVisible = true;
        if (breakdownEmpty) breakdownEmpty.style.display = "none";
        if (!breakdownCanvas.__rerenderFn) {
          breakdownCanvas.__rerenderFn = function(){
            var payload = breakdownCanvas.__chartData || [];
            renderFindingBreakdown(breakdownCanvas, payload);
          };
          window.addEventListener("resize", breakdownCanvas.__rerenderFn);
        }
        breakdownCanvas.__chartData = breakdownData;
        breakdownCanvas.__rerenderFn();

        if (breakdownLegend) {
          breakdownLegend.innerHTML = "";
          for (var bi = 0; bi < breakdownData.length; bi++) {
            var bItem = breakdownData[bi];
            var legendItem = document.createElement("div");
            legendItem.className = "legend-item";
            var swatch = document.createElement("span");
            swatch.className = "legend-swatch";
            swatch.style.background = bItem.color;
            var label = document.createElement("span");
            label.textContent = bItem.label + " · " + bItem.value;
            legendItem.appendChild(swatch);
            legendItem.appendChild(label);
            breakdownLegend.appendChild(legendItem);
          }
        }
      } else {
        breakdownCard.style.display = "block";
        chartPanelsVisible = true;
        if (breakdownEmpty) breakdownEmpty.style.display = "block";
        if (breakdownLegend) breakdownLegend.innerHTML = "";
      }
    }
  }

  if (chartDashboardCard) {
    chartDashboardCard.style.display = chartPanelsVisible ? "block" : "none";
  }
}

function renderPagination(paginationDerived) {
  if (!paginationDerived) {
    $("paginationCard").style.display = "none";
    return;
  }
  $("paginationCard").style.display = "block";
  var seeds = paginationDerived.sitemapSeeds || [];
  var guesses = paginationDerived.guessesTried || [];
  var qpCount = paginationDerived.patternSampleCounts && paginationDerived.patternSampleCounts.queryParams != null ? paginationDerived.patternSampleCounts.queryParams : 0;
  var psCount = paginationDerived.patternSampleCounts && paginationDerived.patternSampleCounts.pathSegments != null ? paginationDerived.patternSampleCounts.pathSegments : 0;

  fillChips($("pgSeeds"), seeds, 4);
  $("pgInfo").textContent = "queryParams: " + qpCount + " · pathSegments: " + psCount;
  fillChips($("pgGuesses"), guesses, 6);
}

function renderCaching(caching, imageStats) {
  var card = $("cachingCard");
  if (!card) return;
  var policyEl = $("cachePolicy");
  var ttlEl = $("cacheTtl");
  var sharedTtlEl = $("sharedCacheTtl");
  var headerEl = $("cacheHeader");
  var statusEl = $("cacheStatus");
  var list = $("imageOptimizationList");

  if (!caching) {
    card.style.display = "none";
    return;
  }

  card.style.display = "block";
  if (policyEl) policyEl.textContent = caching.policy || "—";
  if (ttlEl) ttlEl.textContent = caching.ttlSeconds != null ? formatDurationSeconds(caching.ttlSeconds) : "0s";
  if (sharedTtlEl) sharedTtlEl.textContent = caching.sharedTtlSeconds != null ? formatDurationSeconds(caching.sharedTtlSeconds) : "—";
  if (headerEl) headerEl.textContent = caching.cacheControl || "(missing)";
  if (statusEl) statusEl.textContent = caching.cacheable ? "Cacheable" : "Uncacheable";

  if (list) {
    list.innerHTML = "";
    var images = imageStats || {};
    var imageEntries = [
      { label: "Modern formats", value: images.modernPct != null ? Math.round(images.modernPct) + "%" : "—", detail: "AVIF/WebP adoption" },
      { label: "Responsive images", value: images.responsivePct != null ? Math.round(images.responsivePct) + "%" : "—", detail: "srcset/picture usage" },
      { label: "Lazy-loaded images", value: images.lazyPct != null ? Math.round(images.lazyPct) + "%" : "—", detail: "loading=\"lazy\" coverage" }
    ];
    imageEntries.forEach(function(entry){
      var li = document.createElement("li");
      li.className = "simpleMetric";
      var heading = document.createElement("div");
      heading.className = "summary";
      heading.textContent = entry.label + ": " + entry.value;
      var detail = document.createElement("div");
      detail.className = "detail";
      detail.textContent = entry.detail;
      li.appendChild(heading);
      li.appendChild(detail);
      list.appendChild(li);
    });
  }
}

function renderHeader(data) {
  var urlFromDom = data.dom && data.dom.url ? data.dom.url : "";
  var urlFromNet = data.net && data.net.url ? data.net.url : "";
  var finalUrl = urlFromDom || urlFromNet || "";
  var multiInfo = data.meta && data.meta.multi ? data.meta.multi : null;
  if (multiInfo && multiInfo.origin) {
    finalUrl = multiInfo.origin + (multiInfo.count > 1 ? " (" + multiInfo.count + " pages)" : "");
  }
  $("url").textContent = finalUrl;
  var overallScore = data.overall && data.overall.score != null ? data.overall.score : null;
  $("overallScore").textContent = overallScore != null ? overallScore : "—";
  $("overallGrade").textContent = data.overall && data.overall.grade ? data.overall.grade : "—";
  return { overallScore: overallScore, multiInfo: multiInfo };
}

(function init(){
  var downloadBtn = $("downloadPdf");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", function(){
      window.print();
    });
  }

  var params = parseQuery();
  var key = params["k"];
  if (!key) {
    $("raw").textContent = JSON.stringify({ error: "Missing ?k param" }, null, 2);
    return;
  }

  var hasChrome = typeof chrome !== "undefined" && chrome && chrome.storage && chrome.storage.local;
  if (!hasChrome) {
    $("raw").textContent = JSON.stringify({ error: "chrome.storage.local unavailable", key: key }, null, 2);
    return;
  }

  chrome.storage.local.get(key, function(stored){
    var data = stored && stored[key] ? stored[key] : null;
    if (!data) {
      $("raw").textContent = JSON.stringify({ error: "No data for key", key: key }, null, 2);
      return;
    }

    var headerInfo = renderHeader(data);
    renderMultiPageList(headerInfo.multiInfo);

    updateCharts(data, headerInfo.overallScore);

    renderLighthouseCard(data.lighthouse);
    renderGeoDeepDive(data.dom && data.dom.geo ? data.dom.geo : null, data.categories && data.categories.geo ? data.categories.geo : null);
    renderGtmInventory(data.dom && data.dom.gtm ? data.dom.gtm : null);
    renderMediaInventory(data.dom && data.dom.mediaAssets ? data.dom.mediaAssets : null);

    renderCaching(data.caching, data.dom && data.dom.images ? data.dom.images : null);

    renderPagination(data.net && data.net.paginationDerived ? data.net.paginationDerived : null);

    renderRecommendations(data.recommendations || []);

    try {
      $("raw").textContent = JSON.stringify(data, null, 2);
    } catch (e) {
      $("raw").textContent = String(e);
    }
  });
})();
