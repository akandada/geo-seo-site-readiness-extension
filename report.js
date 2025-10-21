// report.js — MV3-safe, no optional chaining, reads from chrome.storage.local

function grade(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function $(id) { return document.getElementById(id); }

function cardEl(title, score, items) {
  var div = document.createElement("div");
  div.className = "card";
  var listHtml = "";
  if (items && items.length) {
    listHtml = '<ul class="list">' + items.map(function(i){
      var cls = i.state || "";
      var txt = i.text || "";
      return '<li class="' + cls + '">' + escapeHtml(txt) + "</li>";
    }).join("") + "</ul>";
  } else {
    listHtml = '<div class="muted">No items.</div>';
  }
  div.innerHTML =
    '<h2>' + escapeHtml(title) + '</h2>' +
    '<div class="score">' + (score != null ? score : "—") + ' (' + grade(Number(score) || 0) + ')</div>' +
    listHtml;
  return div;
}

function escapeHtml(s){
  s = String(s == null ? "" : s);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseQuery() {
  var out = {};
  var q = location.search || "";
  if (q.startsWith("?")) q = q.slice(1);
  q.split("&").forEach(function(pair){
    if (!pair) return;
    var idx = pair.indexOf("=");
    if (idx < 0) { out[decodeURIComponent(pair)] = ""; return; }
    var k = decodeURIComponent(pair.slice(0, idx));
    var v = decodeURIComponent(pair.slice(idx + 1));
    out[k] = v;
  });
  return out;
}

function fillChips(el, items, cap) {
  if (!el) return;
  el.innerHTML = "";
  if (!items || !items.length) {
    var span = document.createElement("span");
    span.className = "chip";
    span.textContent = "(none)";
    el.appendChild(span);
    return;
  }
  var limited = items.slice(0, cap || 6);
  limited.forEach(function(x){
    var span = document.createElement("span");
    span.className = "chip";
    span.textContent = x;
    el.appendChild(span);
  });
  if (items.length > limited.length) {
    var more = document.createElement("span");
    more.className = "chip";
    more.textContent = "+" + (items.length - limited.length) + " more";
    el.appendChild(more);
  }
}

(function init(){
  var params = parseQuery();
  var key = params["k"];
  if (!key) {
    $("raw").textContent = JSON.stringify({ error: "Missing ?k param" }, null, 2);
    return;
  }

  chrome.storage.local.get(key, function(stored){
    var data = stored && stored[key] ? stored[key] : null;
    if (!data) {
      $("raw").textContent = JSON.stringify({ error: "No data for key", key: key }, null, 2);
      return;
    }

    // Header
    var urlFromDom = data.dom && data.dom.url ? data.dom.url : "";
    var urlFromNet = data.net && data.net.url ? data.net.url : "";
    var finalUrl = urlFromDom || urlFromNet || "";
    $("url").textContent = finalUrl;
    $("overallScore").textContent = data.overall && data.overall.score != null ? data.overall.score : "—";
    $("overallGrade").textContent = data.overall && data.overall.grade ? data.overall.grade : "—";

    // Category cards
    var catMap = [
      ["Performance", data.categories && data.categories.performance],
      ["Crawlability & SEO", data.categories && data.categories.seo],
      ["LLM Readiness", data.categories && data.categories.llm],
      ["Accessibility & Semantics", data.categories && data.categories.a11y],
      ["Infinite Scroll Pattern", data.categories && data.categories.infinite]
    ];
    var container = $("categoryCards");
    container.innerHTML = "";
    catMap.forEach(function(pair){
      var title = pair[0];
      var cat = pair[1];
      if (!cat) return;
      container.appendChild(cardEl(title, cat.score, cat.items));
    });

    // Pagination (Derived) summary, if present
    var p = data.net && data.net.paginationDerived ? data.net.paginationDerived : null;
    if (p) {
      $("paginationCard").style.display = "block";
      var seeds = p.sitemapSeeds || [];
      var guesses = p.guessesTried || [];
      var qpCount = p.patternSampleCounts && p.patternSampleCounts.queryParams != null ? p.patternSampleCounts.queryParams : 0;
      var psCount = p.patternSampleCounts && p.patternSampleCounts.pathSegments != null ? p.patternSampleCounts.pathSegments : 0;

      fillChips($("pgSeeds"), seeds, 4);
      $("pgInfo").textContent = "queryParams: " + qpCount + " · pathSegments: " + psCount;
      fillChips($("pgGuesses"), guesses, 6);
    } else {
      $("paginationCard").style.display = "none";
    }

    // Suggestions
    var sug = $("suggestions");
    sug.innerHTML = "";
    var suggs = data.suggestions || [];
    if (!suggs.length) {
      var li0 = document.createElement("li");
      li0.className = "muted";
      li0.textContent = "No suggestions.";
      sug.appendChild(li0);
    } else {
      suggs.forEach(function(s){
        var li = document.createElement("li");
        li.textContent = s;
        sug.appendChild(li);
      });
    }

    // Raw
    try {
      $("raw").textContent = JSON.stringify(data, null, 2);
    } catch (e) {
      $("raw").textContent = String(e);
    }
  });
})();
