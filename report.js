import { renderOverallGauge, renderFindingBreakdown, renderScoreChart } from "./report/charts.js";
import { $, cardEl, fillChips, parseQuery } from "./report/dom.js";
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
    ["GEO / LLM Readiness", data.categories && data.categories.geo],
    ["Crawlability & SEO", data.categories && data.categories.seo],
    ["Answer Engine Optimization", data.categories && data.categories.answer],
    ["Accessibility & Semantics", data.categories && data.categories.a11y],
    ["Performance", data.categories && data.categories.performance],
    ["Infinite Scroll Pattern", data.categories && data.categories.infinite]
  ];

  var container = $("categoryCards");
  if (container) {
    container.innerHTML = "";
    var chartCanvas = $("scoreChartCanvas");
    var chartCard = $("scoreChartCard");
    var chartEmpty = $("scoreChartEmpty");
    var chartData = [];

    catMap.forEach(function(pair){
      var title = pair[0];
      var cat = pair[1];
      if (!cat) return;
      container.appendChild(cardEl(title, cat.score, cat.items));
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
        var catEntry = catMap[ci][1];
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

    renderPagination(data.net && data.net.paginationDerived ? data.net.paginationDerived : null);

    renderRecommendations(data.recommendations || []);

    try {
      $("raw").textContent = JSON.stringify(data, null, 2);
    } catch (e) {
      $("raw").textContent = String(e);
    }
  });
})();
