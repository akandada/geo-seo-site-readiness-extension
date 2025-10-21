// report.js — MV3-safe, no optional chaining, reads from chrome.storage.local

function grade(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function scoreColor(score) {
  if (score >= 90) return "#2aa745";
  if (score >= 75) return "#5ca2ff";
  if (score >= 60) return "#e3a008";
  return "#e63946";
}

function renderOverallGauge(canvas, score) {
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var dpr = window.devicePixelRatio || 1;
  var parent = canvas.parentNode;
  var size = parent && parent.clientWidth ? parent.clientWidth : 320;
  if (size < 240) size = 240;
  var padding = 18;
  var radius = (size / 2) - padding;
  if (radius < 60) radius = 60;
  var center = size / 2;

  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + "px";
  canvas.style.height = size + "px";

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);

  var clamped = Number(score);
  if (clamped !== clamped) clamped = 0;
  if (clamped < 0) clamped = 0;
  if (clamped > 100) clamped = 100;

  var start = -Math.PI / 2;
  var end = start + (Math.PI * 2 * (clamped / 100));
  var trackWidth = Math.max(radius * 0.2, 16);

  ctx.lineCap = "round";
  ctx.lineWidth = trackWidth;

  ctx.beginPath();
  ctx.strokeStyle = "rgba(92,162,255,0.18)";
  ctx.arc(center, center, radius - trackWidth / 2, 0, Math.PI * 2, false);
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = scoreColor(clamped);
  ctx.arc(center, center, radius - trackWidth / 2, start, end, false);
  ctx.stroke();

  ctx.fillStyle = "#e6eef6";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "28px 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  ctx.fillText(Math.round(clamped), center, center - 6);

  ctx.font = "16px 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  ctx.fillStyle = "rgba(230,238,246,0.75)";
  ctx.fillText("Grade " + grade(clamped), center, center + 18);
}

function renderFindingBreakdown(canvas, data) {
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var dpr = window.devicePixelRatio || 1;
  var parent = canvas.parentNode;
  var width = parent && parent.clientWidth ? parent.clientWidth : 420;
  var height = width * 0.65;
  if (height < 220) height = 220;
  var radius = Math.min(width, height) / 2 - 24;
  if (radius < 70) radius = 70;
  var centerX = width / 2;
  var centerY = Math.min(height / 2 + 12, height - radius - 12);

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);

  var total = 0;
  for (var i = 0; i < data.length; i++) {
    var v = data[i] && data[i].value != null ? Number(data[i].value) : 0;
    if (v === v && v > 0) total += v;
  }
  if (!total) {
    return;
  }

  var currentAngle = -Math.PI / 2;
  for (var j = 0; j < data.length; j++) {
    var item = data[j];
    var val = item && item.value != null ? Number(item.value) : 0;
    if (!(val > 0)) {
      continue;
    }
    var portion = val / total;
    var endAngle = currentAngle + portion * Math.PI * 2;
    ctx.beginPath();
    ctx.fillStyle = item.color || "#5ca2ff";
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, endAngle);
    ctx.closePath();
    ctx.fill();
    currentAngle = endAngle;
  }

  ctx.beginPath();
  ctx.fillStyle = "#121821";
  ctx.arc(centerX, centerY, radius * 0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e6eef6";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "18px 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  ctx.fillText(total + " findings", centerX, centerY);
}

function renderScoreChart(canvas, categories) {
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var dpr = window.devicePixelRatio || 1;
  var parent = canvas.parentNode;
  var width = parent && parent.clientWidth ? parent.clientWidth : 600;
  var paddingX = 24;
  var paddingY = 24;
  var barHeight = 28;
  var gap = 16;
  var labelWidth = 160;
  var count = categories ? categories.length : 0;
  var height = paddingY * 2 + (count > 0 ? (count * barHeight + (count - 1) * gap) : 0);

  if (width <= 0) { width = 600; }
  if (height <= 0) { height = paddingY * 2 + barHeight; }

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);

  if (!count) {
    return;
  }

  var font = "13px 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  var trackColor = "rgba(92,162,255,0.14)";
  var textColor = "#e6eef6";

  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(0, 0, width, height);

  for (var i = 0; i < count; i++) {
    var item = categories[i];
    var score = item.score;
    if (score == null || score !== score) score = 0;
    if (score < 0) score = 0;
    if (score > 100) score = 100;

    var y = paddingY + i * (barHeight + gap);
    var barX = paddingX + labelWidth;
    var maxWidth = width - paddingX - barX;
    if (maxWidth < 60) maxWidth = 60;
    var filledWidth = maxWidth * (score / 100);

    ctx.fillStyle = trackColor;
    ctx.fillRect(barX, y, maxWidth, barHeight);

    ctx.fillStyle = scoreColor(score);
    ctx.fillRect(barX, y, filledWidth, barHeight);

    ctx.fillStyle = textColor;
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(item.title, paddingX, y + barHeight / 2);

    ctx.textAlign = "right";
    var scoreLabel = Math.round(score) + " (" + grade(score) + ")";
    ctx.fillText(scoreLabel, barX + maxWidth, y + barHeight / 2);
  }
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
      var detail = i.detail ? '<div class="detail">' + escapeHtml(i.detail) + '</div>' : "";
      var fix = "";
      if (i.fix && (cls === "warn" || cls === "bad")) {
        fix = '<div class="fix">Fix: ' + escapeHtml(i.fix) + '</div>';
      }
      return '<li class="' + cls + '"><div class="summary">' + escapeHtml(txt) + '</div>' + detail + fix + "</li>";
    }).join("") + "</ul>";
  } else {
    listHtml = '<div class="muted">No items.</div>';
  }
  var gradeLabel = "—";
  if (score != null) {
    var num = Number(score);
    if (num === num) {
      gradeLabel = grade(num);
    }
  }
  div.innerHTML =
    '<h2>' + escapeHtml(title) + '</h2>' +
    '<div class="score">' + (score != null ? score : "—") + ' (' + gradeLabel + ')</div>' +
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

    // Header
    var urlFromDom = data.dom && data.dom.url ? data.dom.url : "";
    var urlFromNet = data.net && data.net.url ? data.net.url : "";
    var finalUrl = urlFromDom || urlFromNet || "";
    $("url").textContent = finalUrl;
    var overallScore = data.overall && data.overall.score != null ? data.overall.score : null;
    $("overallScore").textContent = overallScore != null ? overallScore : "—";
    $("overallGrade").textContent = data.overall && data.overall.grade ? data.overall.grade : "—";

    var gaugeCanvas = $("overallGaugeCanvas");
    var gaugeCard = $("overallGaugeCard");
    var gaugeEmpty = $("overallGaugeEmpty");
    if (gaugeCanvas && gaugeCard) {
      if (overallScore != null && overallScore === overallScore) {
        gaugeCard.style.display = "block";
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
        if (gaugeEmpty) gaugeEmpty.style.display = "block";
      }
    }

    // Category cards
    var catMap = [
      ["Performance", data.categories && data.categories.performance],
      ["Crawlability & SEO", data.categories && data.categories.seo],
      ["GEO Content Optimization", data.categories && data.categories.geo],
      ["LLM Readiness", data.categories && data.categories.llm],
      ["Accessibility & Semantics", data.categories && data.categories.a11y],
      ["Infinite Scroll Pattern", data.categories && data.categories.infinite]
    ];
    var container = $("categoryCards");
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
        if (breakdownEmpty) breakdownEmpty.style.display = "block";
        if (breakdownLegend) breakdownLegend.innerHTML = "";
      }
    }

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
