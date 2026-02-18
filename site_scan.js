import { auditPageWithReusableTab, aggregatePageResults } from "./audit_core.js";

(function(){
  "use strict";
  var startBtn = document.getElementById("startScan");
  var cancelBtn = document.getElementById("cancelScan");
  var maxPagesEl = document.getElementById("maxPages");
  var samplingEl = document.getElementById("sampling");
  var includeEl = document.getElementById("includePatterns");
  var excludeEl = document.getElementById("excludePatterns");
  var statusEl = document.getElementById("status");
  var countsEl = document.getElementById("counts");
  var progressBar = document.getElementById("progressBar");
  var warningsEl = document.getElementById("warnings");
  var summaryEl = document.getElementById("summaryStats");
  var pagesBody = document.getElementById("pagesBody");
  var exportJsonBtn = document.getElementById("exportJson");
  var exportCsvBtn = document.getElementById("exportCsv");
  var filterInput = document.getElementById("filterInput");
  var originLabel = document.getElementById("originLabel");
  var currentOrigin = "";
  var cancelled = false;
  var activeTabId = null;
  var runData = null;
  var sortKey = "score";

  function parseOrigin(){
    var params = new URLSearchParams(location.search);
    var origin = params.get("origin") || "";
    try { currentOrigin = new URL(origin).origin; } catch (e) { currentOrigin = ""; }
    originLabel.textContent = "Origin: " + (currentOrigin || "—");
  }

  function linesToPatterns(text){ return String(text || "").split(/\n/).map(function(v){return v.trim();}).filter(Boolean); }

  function sampleUrls(urls, maxPages, strategy){
    var arr = urls.slice();
    if (strategy === "random") arr.sort(function(){ return Math.random() - 0.5; });
    if (strategy === "path") {
      arr.sort(function(a,b){
        var ap = (new URL(a)).pathname.split("/").filter(Boolean).length;
        var bp = (new URL(b)).pathname.split("/").filter(Boolean).length;
        return ap - bp;
      });
    }
    return arr.slice(0, maxPages);
  }

  function pageSummary(page){
    var fail = (page.keyChecks || []).filter(function(k){ return k.state === "bad" || k.state === "warn"; }).length;
    var cats = page.categories || {};
    return (cats.geo ? cats.geo.score : "-") + "/" + (cats.seo ? cats.seo.score : "-") + "/" + (cats.answer ? cats.answer.score : "-") + "/" + (cats.a11y ? cats.a11y.score : "-") + "/" + (cats.performance ? cats.performance.score : "-") + " | " + fail + " issues";
  }

  function renderTable(){
    var list = runData && runData.pages ? runData.pages.slice() : [];
    var q = (filterInput.value || "").toLowerCase();
    if (q) list = list.filter(function(p){ return p.url.toLowerCase().indexOf(q) !== -1; });
    list.sort(function(a,b){
      if (sortKey === "url") return a.url.localeCompare(b.url);
      return (b.overall.score || 0) - (a.overall.score || 0);
    });
    pagesBody.innerHTML = "";
    for (var i=0;i<list.length;i++) {
      var p = list[i];
      var tr = document.createElement("tr");
      tr.innerHTML = "<td>" + p.url + "</td><td>" + p.overall.score + "</td><td>" + p.overall.grade + "</td><td>" + pageSummary(p) + "</td><td>" + ((p.keyChecks || []).filter(function(k){return k.state !== 'ok';}).length) + "</td><td><button data-url='" + p.url + "'>Run</button></td>";
      pagesBody.appendChild(tr);
    }
  }

  async function runScan(){
    cancelled = false;
    startBtn.disabled = true;
    cancelBtn.disabled = false;
    warningsEl.innerHTML = "";
    statusEl.textContent = "Scanning";
    var maxPages = Number(maxPagesEl.value || 50);
    var discovery = await chrome.runtime.sendMessage({ type:"DISCOVER_SITE_URLS", origin: currentOrigin, maxUrls: maxPages, maxSitemaps: 10, includePatterns: linesToPatterns(includeEl.value), excludePatterns: linesToPatterns(excludeEl.value) });
    var discoveredUrls = discovery && discovery.urls ? discovery.urls : [];
    if (!discoveredUrls.length) {
      var fallback = await chrome.tabs.query({ active:true, currentWindow:true });
      if (fallback && fallback[0] && fallback[0].url) discoveredUrls = [fallback[0].url];
      var w = document.createElement("div"); w.className = "warn"; w.textContent = "No sitemap found. Scanning active page only."; warningsEl.appendChild(w);
    }
    var selected = sampleUrls(discoveredUrls, maxPages, samplingEl.value || "first");
    progressBar.max = selected.length || 1;
    var created = await chrome.tabs.create({ url: selected[0], active: false });
    activeTabId = created && created.id ? created.id : null;
    var pages = [];
    for (var i=0;i<selected.length;i++) {
      if (cancelled) break;
      countsEl.textContent = "Discovered: " + discoveredUrls.length + " • Scanned: " + i;
      progressBar.value = i;
      var result = await auditPageWithReusableTab({ url: selected[i], origin: currentOrigin, tabId: activeTabId, timeoutMs: 25000, onProgress: function(){} });
      pages.push({ url: result.url, label: result.label, overall: result.summary.overall, categories: result.summary.categories, keyChecks: result.summary.keyChecks, recommendations: result.summary.recommendations });
    }
    if (activeTabId) { try { await chrome.tabs.remove(activeTabId); } catch (e2) {} activeTabId = null; }
    var aggregate = aggregatePageResults(pages.map(function(p){ return { url:p.url, label:p.label, audit:p }; }), currentOrigin);
    runData = {
      meta: { origin: currentOrigin, startedAt: Date.now(), finishedAt: Date.now(), scannedCount: pages.length, discoveredCount: discoveredUrls.length, truncated: discovery && discovery.truncated ? true : false, version: 1 },
      discovery: { sitemapsUsed: discovery && discovery.sitemapsUsed ? discovery.sitemapsUsed : [], warnings: discovery && discovery.warnings ? discovery.warnings : [] },
      aggregate: aggregate,
      pages: pages
    };
    var key = "site-scan-" + Math.random().toString(36).slice(2);
    var obj = {}; obj[key] = runData; await chrome.storage.local.set(obj);
    summaryEl.textContent = "Average score: " + (aggregate.overall ? aggregate.overall.score : "-") + " | Pages: " + pages.length;
    countsEl.textContent = "Discovered: " + discoveredUrls.length + " • Scanned: " + pages.length;
    progressBar.value = pages.length;
    statusEl.textContent = cancelled ? "Cancelled" : "Completed";
    startBtn.disabled = false;
    cancelBtn.disabled = true;
    exportJsonBtn.disabled = false;
    exportCsvBtn.disabled = false;
    renderTable();
  }

  startBtn.addEventListener("click", runScan);
  cancelBtn.addEventListener("click", function(){ cancelled = true; statusEl.textContent = "Cancelled"; if (activeTabId) chrome.tabs.remove(activeTabId); });
  filterInput.addEventListener("input", renderTable);
  document.querySelectorAll("th[data-sort]").forEach(function(th){ th.addEventListener("click", function(){ sortKey = th.getAttribute("data-sort") || "score"; renderTable(); }); });
  pagesBody.addEventListener("click", async function(e){
    var t = e.target;
    if (!t || t.tagName !== "BUTTON") return;
    var url = t.getAttribute("data-url");
    if (!url) return;
    var tab = await chrome.tabs.create({ url: url, active: false });
    var result = await auditPageWithReusableTab({ url: url, origin: currentOrigin, tabId: tab.id, timeoutMs: 25000, onProgress: function(){} });
    try { await chrome.tabs.remove(tab.id); } catch (e1) {}
    var key = "audit-" + Math.random().toString(36).slice(2);
    var obj = {}; obj[key] = result.audit; await chrome.storage.local.set(obj);
    chrome.tabs.create({ url: chrome.runtime.getURL("report.html?k=" + encodeURIComponent(key)) });
  });

  exportJsonBtn.addEventListener("click", function(){
    if (!runData) return;
    var blob = new Blob([JSON.stringify(runData, null, 2)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "site-scan.json"; a.click();
  });
  exportCsvBtn.addEventListener("click", function(){
    if (!runData || !runData.pages) return;
    var rows = ["url,score,grade,geo,seo,answer,a11y,performance,failures"];
    runData.pages.forEach(function(p){
      var c = p.categories || {};
      var fail = (p.keyChecks || []).filter(function(k){ return k.state !== "ok"; }).length;
      rows.push([p.url,p.overall.score,p.overall.grade,c.geo?c.geo.score:"",c.seo?c.seo.score:"",c.answer?c.answer.score:"",c.a11y?c.a11y.score:"",c.performance?c.performance.score:"",fail].join(","));
    });
    var blob = new Blob([rows.join("\n")], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "site-scan.csv"; a.click();
  });

  parseOrigin();
})();
