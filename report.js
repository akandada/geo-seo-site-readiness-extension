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
  var size = parent && parent.clientWidth ? parent.clientWidth : 260;
  if (size < 200) size = 200;
  var padding = 18;
  var radius = (size / 2) - padding;
  if (radius < 54) radius = 54;
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
  var width = parent && parent.clientWidth ? parent.clientWidth : 340;
  var height = width * 0.6;
  if (height < 180) height = 180;
  var radius = Math.min(width, height) / 2 - 20;
  if (radius < 60) radius = 60;
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
  var width = parent && parent.clientWidth ? parent.clientWidth : 360;
  var paddingX = 20;
  var paddingY = 18;
  var barHeight = 24;
  var gap = 14;
  var labelWidth = 140;
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

function formatPercent(value, decimals) {
  var num = Number(value);
  if (num !== num) num = 0;
  if (decimals == null) decimals = 0;
  var factor = Math.pow(10, decimals);
  var pct = Math.round(num * 100 * factor) / factor;
  return pct.toFixed(decimals);
}

function formatList(arr, max) {
  if (!arr || !arr.length) return "";
  var limit = typeof max === "number" && max >= 0 ? max : arr.length;
  var slice = arr.slice(0, limit);
  return slice.join(", ") + (arr.length > slice.length ? "…" : "");
}

function formatBytes(bytes) {
  var num = Number(bytes);
  if (!(num > 0)) return "—";
  var units = ["B", "KB", "MB", "GB", "TB"];
  var idx = 0;
  while (num >= 1024 && idx < units.length - 1) {
    num = num / 1024;
    idx++;
  }
  var precision = idx === 0 || num >= 100 ? 0 : 1;
  var rounded = Math.round(num * Math.pow(10, precision)) / Math.pow(10, precision);
  return rounded.toFixed(precision) + " " + units[idx];
}

function mediaDisplayLabel(url) {
  if (!url) return "Unknown";
  if (url.indexOf("data:") === 0) return "data URI";
  try {
    var u = new URL(url);
    var path = u.pathname || "";
    var segments = path.split("/").filter(function(part){ return part; });
    var file = segments.length ? segments[segments.length - 1] : "";
    var host = u.hostname || "";
    var label = file || host || url;
    if (host && file) {
      label += " · " + host;
    }
    if (label.length > 80) {
      label = label.slice(0, 77) + "…";
    }
    return label;
  } catch (e) {
    if (url.length > 80) return url.slice(0, 77) + "…";
    return url;
  }
}

function renderComponentInventory(components) {
  var card = $("componentInventoryCard");
  if (!card) return;
  var list = $("componentList");
  var empty = $("componentEmpty");
  var meta = $("componentMeta");

  if (!components || !components.length) {
    card.style.display = "block";
    if (meta) meta.textContent = "";
    if (list) list.innerHTML = "";
    if (empty) empty.style.display = "block";
    return;
  }

  card.style.display = "block";
  if (empty) empty.style.display = "none";
  if (list) list.innerHTML = "";

  var totalIssues = 0;
  for (var ti = 0; ti < components.length; ti++) {
    var compIssueList = components[ti] && components[ti].issues ? components[ti].issues.filter(Boolean) : [];
    totalIssues += compIssueList.length;
  }

  if (meta) {
    meta.textContent = components.length + " component(s) captured" + (totalIssues ? " · " + totalIssues + " issue(s) flagged" : "");
  }

  function addMetric(container, label, value) {
    if (!container) return;
    if (value === "" || value === null || value === undefined) return;
    var row = document.createElement("div");
    row.className = "componentMetric";
    var lab = document.createElement("div");
    lab.className = "label";
    lab.textContent = label;
    var val = document.createElement("div");
    val.className = "value";
    val.textContent = String(value);
    row.appendChild(lab);
    row.appendChild(val);
    container.appendChild(row);
  }

  components.forEach(function(comp, index){
    if (!comp) return;
    var details = document.createElement("details");
    details.className = "component";
    if (index === 0) details.open = true;

    var summary = document.createElement("summary");
    summary.textContent = comp.label ? comp.label : "Component " + (index + 1);
    details.appendChild(summary);

    var body = document.createElement("div");
    body.className = "componentBody";

    var metrics = document.createElement("div");
    metrics.className = "componentMetrics";

    addMetric(metrics, "Tag", comp.tag || "—");
    addMetric(metrics, "Role", comp.role || "—");
    if (comp.depth != null) addMetric(metrics, "DOM depth", comp.depth);
    if (comp.area != null && comp.area !== undefined) addMetric(metrics, "Approx. area", comp.area + " px²");
    if (comp.words != null) addMetric(metrics, "Words", comp.words);
    if (comp.textLength != null) addMetric(metrics, "Characters", comp.textLength);
    if (comp.headingCount != null) {
      var headingDetail = String(comp.headingCount);
      if (comp.headings && comp.headings.length) {
        headingDetail += " – " + formatList(comp.headings, 4);
      }
      addMetric(metrics, "Headings", headingDetail);
    }
    if (comp.linkCount != null) {
      var linkDetail = String(comp.linkCount);
      if (comp.externalLinkCount != null) {
        linkDetail += " (external: " + comp.externalLinkCount + ")";
      }
      if (comp.uniqueLinkHosts && comp.uniqueLinkHosts.length) {
        linkDetail += " · " + formatList(comp.uniqueLinkHosts, 5);
      }
      addMetric(metrics, "Links", linkDetail);
    }
    if (comp.imageCount != null) {
      var imageDetail = String(comp.imageCount);
      if (comp.missingAltCount != null && comp.missingAltCount > 0) {
        imageDetail += " · " + comp.missingAltCount + " missing alt";
      }
      addMetric(metrics, "Images", imageDetail);
    }
    if (comp.listCount != null) addMetric(metrics, "Lists", comp.listCount);
    if (comp.buttonCount != null) addMetric(metrics, "Buttons", comp.buttonCount);
    if (comp.formCount != null) addMetric(metrics, "Forms", comp.formCount);
    if (comp.interactiveCount != null) addMetric(metrics, "Interactive elements", comp.interactiveCount);
    if (comp.mediaCount != null) addMetric(metrics, "Media embeds", comp.mediaCount);
    if (comp.hasStructuredData) addMetric(metrics, "Structured data", "Contains JSON-LD");
    if (comp.dataAttributes && comp.dataAttributes.length) {
      var dataPairs = [];
      for (var di = 0; di < comp.dataAttributes.length; di++) {
        var attr = comp.dataAttributes[di];
        if (!attr) continue;
        var labelText = attr.name ? attr.name : "data";
        var valueText = attr.value ? attr.value : "";
        dataPairs.push(labelText + (valueText ? "=" + valueText : ""));
      }
      if (dataPairs.length) addMetric(metrics, "Data attributes", dataPairs.join(" · "));
    }

    body.appendChild(metrics);

    var issues = comp.issues && comp.issues.length ? comp.issues.filter(Boolean) : [];
    if (issues.length) {
      var badgeWrap = document.createElement("div");
      badgeWrap.className = "componentBadges";
      for (var ii = 0; ii < issues.length; ii++) {
        var badge = document.createElement("span");
        var text = issues[ii];
        badge.className = text && /off-site/i.test(text) ? "componentBadge warn" : "componentBadge";
        badge.textContent = text;
        badgeWrap.appendChild(badge);
      }
      body.appendChild(badgeWrap);
    }

    if (comp.textPreview) {
      var preview = document.createElement("div");
      preview.className = "componentPreview";
      preview.textContent = comp.textPreview;
      body.appendChild(preview);
    }

    details.appendChild(body);
    if (list) list.appendChild(details);
  });
}

function renderMediaInventory(mediaList) {
  var card = $("mediaInventoryCard");
  if (!card) return;
  var wrap = $("mediaInventoryWrap");
  var table = $("mediaInventoryTable");
  var empty = $("mediaInventoryEmpty");
  var tbody = table ? table.querySelector("tbody") : null;
  if (!tbody && table) {
    tbody = document.createElement("tbody");
    table.appendChild(tbody);
  }

  var list = Array.isArray(mediaList) ? mediaList : [];

  if (!list.length) {
    card.style.display = "block";
    if (wrap) wrap.style.display = "none";
    if (empty) empty.style.display = "block";
    if (tbody) tbody.innerHTML = "";
    return;
  }

  card.style.display = "block";
  if (wrap) wrap.style.display = "block";
  if (empty) empty.style.display = "none";
  if (tbody) tbody.innerHTML = "";

  var sorted = list.slice().sort(function(a, b){
    var aSize = a && a.bytes ? a.bytes : 0;
    var bSize = b && b.bytes ? b.bytes : 0;
    if (bSize !== aSize) return bSize - aSize;
    var aUrl = a && a.url ? a.url : "";
    var bUrl = b && b.url ? b.url : "";
    return aUrl.localeCompare(bUrl);
  });

  var limit = sorted.length > 25 ? 25 : sorted.length;
  for (var i = 0; i < limit; i++) {
    var asset = sorted[i] || {};
    var row = document.createElement("tr");

    var rankCell = document.createElement("td");
    rankCell.textContent = String(i + 1);
    row.appendChild(rankCell);

    var labelCell = document.createElement("td");
    var url = asset.url || "";
    labelCell.textContent = mediaDisplayLabel(url);
    if (url) labelCell.title = url;
    row.appendChild(labelCell);

    var typeCell = document.createElement("td");
    var typeRaw = asset.type ? String(asset.type).toLowerCase() : "";
    if (typeRaw === "img") typeRaw = "image";
    if (typeRaw) {
      typeCell.textContent = typeRaw.charAt(0).toUpperCase() + typeRaw.slice(1);
    } else {
      typeCell.textContent = "—";
    }
    row.appendChild(typeCell);

    var sizeCell = document.createElement("td");
    sizeCell.textContent = formatBytes(asset.bytes);
    row.appendChild(sizeCell);

    var detailCell = document.createElement("td");
    var details = [];
    var naturalW = asset && asset.naturalWidth != null ? Number(asset.naturalWidth) : null;
    var naturalH = asset && asset.naturalHeight != null ? Number(asset.naturalHeight) : null;
    if (naturalW > 0 && naturalH > 0) {
      details.push("natural " + naturalW + "×" + naturalH + " px");
    }
    var displayW = asset && asset.displayWidth != null ? Number(asset.displayWidth) : null;
    var displayH = asset && asset.displayHeight != null ? Number(asset.displayHeight) : null;
    if (displayW > 0 && displayH > 0) {
      details.push("rendered " + displayW + "×" + displayH + " px");
    }
    var occ = asset && asset.occurrences != null ? Number(asset.occurrences) : 0;
    if (occ > 1) {
      details.push(occ + " uses");
    }
    detailCell.textContent = details.length ? details.join(" · ") : "—";
    row.appendChild(detailCell);

    if (tbody) tbody.appendChild(row);
  }
}

function buildGeoReportEntries(geo) {
  var entries = [];
  if (!geo) {
    entries.push({ label: "Content sample", detail: "GEO metrics unavailable from DOM snapshot." });
    return entries;
  }

  var totalWords = Number(geo.totalWords || 0);
  var uniqueWordCount = Number(geo.uniqueWordCount || 0);
  var uniqueWordRatio = Number(geo.uniqueWordRatio || 0);

  if (!totalWords) {
    entries.push({ label: "Content sample", detail: "Insufficient on-page copy to evaluate GEO metrics." });
    return entries;
  }

  entries.push({
    label: "Word volume",
    detail: totalWords + " total words · " + uniqueWordCount + " unique (" + formatPercent(uniqueWordRatio, 1) + "%)."
  });

  var topWordObj = geo.topWord || {};
  var topWord = topWordObj.word || "";
  var topCount = Number(topWordObj.count || 0);
  var topRatio = Number(topWordObj.ratio || 0);
  if (topWord && topCount > 0) {
    entries.push({ label: "Top term", detail: "'" + topWord + "' appears " + topCount + "× (" + formatPercent(topRatio, 1) + "%)." });
  } else {
    entries.push({ label: "Top term", detail: "No dominant keyword detected." });
  }

  var readability = geo.readability || {};
  var sentences = Number(readability.sentences || 0);
  if (sentences > 0) {
    var flesch = Number(readability.flesch || 0);
    entries.push({ label: "Readability", detail: "Flesch ≈ " + Math.round(flesch) + " across " + sentences + " sentence(s)." });
  } else {
    entries.push({ label: "Readability", detail: "Not enough sentences to evaluate reading ease." });
  }

  var technicalRatio = Number(geo.technicalTermRatio || 0);
  entries.push({ label: "Technical language", detail: formatPercent(technicalRatio, 1) + "% of terms flagged as technical or long-form." });

  var structure = geo.structure || {};
  var headings = Number(structure.headings || 0);
  var listItems = Number(structure.listItems || 0);
  var hasTable = !!structure.hasTable;
  var hasEmphasis = !!structure.hasEmphasis;
  var structureParts = ["Headings: " + headings, "List items: " + listItems];
  if (hasTable) structureParts.push("Tables present");
  if (hasEmphasis) structureParts.push("Emphasis styling found");
  entries.push({ label: "Structure", detail: structureParts.join(" · ") });

  var externalLinks = Number(geo.externalLinkCount || 0);
  var authorityCount = Number(geo.citationAuthorityCount || 0);
  var citationDetail = externalLinks + " outbound link(s)";
  if (authorityCount > 0) citationDetail += " · " + authorityCount + " authoritative reference(s)";
  entries.push({ label: "Citations", detail: citationDetail + "." });

  var quoteCount = Number(geo.quoteCount || 0);
  var statsCount = Number(geo.statsCount || 0);
  entries.push({ label: "Evidence", detail: quoteCount + " quotation(s) · " + statsCount + " statistic(s)." });

  return entries;
}

function buildGeoFindingsEntries(geoCategory) {
  var entries = [];
  if (!geoCategory || !geoCategory.items) return entries;
  for (var i = 0; i < geoCategory.items.length; i++) {
    var item = geoCategory.items[i] || {};
    var label = item.text || "";
    var detail = item.detail || "";
    var state = item.state || "";
    if (!label && !detail) continue;
    entries.push({ label: label, detail: detail, state: state });
  }
  return entries;
}

function buildGeoRecommendationsEntries(geoCategory) {
  var entries = [];
  if (!geoCategory || !geoCategory.items) return entries;
  var seen = {};
  for (var i = 0; i < geoCategory.items.length; i++) {
    var item = geoCategory.items[i] || {};
    var fix = item.fix || "";
    if (!fix || seen[fix]) continue;
    seen[fix] = true;
    entries.push({ label: fix, detail: item.text || "" });
  }
  return entries;
}

function populateGeoList(el, entries, placeholder) {
  if (!el) return;
  el.innerHTML = "";
  if (!entries || !entries.length) {
    var empty = document.createElement("li");
    empty.className = "muted";
    empty.textContent = placeholder || "No data.";
    el.appendChild(empty);
    return;
  }
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var li = document.createElement("li");
    if (entry.state) li.className = entry.state;
    var labelDiv = document.createElement("div");
    labelDiv.className = "label";
    labelDiv.textContent = entry.label;
    li.appendChild(labelDiv);
    if (entry.detail) {
      var detailDiv = document.createElement("div");
      detailDiv.className = "detail";
      detailDiv.textContent = entry.detail;
      li.appendChild(detailDiv);
    }
    el.appendChild(li);
  }
}

function renderGeoDeepDive(geoData, geoCategory) {
  var card = $("geoDeepDiveCard");
  if (!card) return;
  var reportList = $("geoReportList");
  var findingsList = $("geoFindingsList");
  var recList = $("geoRecommendationsList");
  var empty = $("geoDeepDiveEmpty");

  var reportEntries = buildGeoReportEntries(geoData);
  var findingsEntries = buildGeoFindingsEntries(geoCategory);
  var recEntries = buildGeoRecommendationsEntries(geoCategory);

  var hasAny = reportEntries.length || findingsEntries.length || recEntries.length;

  if (!hasAny) {
    card.style.display = "block";
    if (empty) empty.style.display = "block";
    if (reportList) reportList.innerHTML = "";
    if (findingsList) findingsList.innerHTML = "";
    if (recList) recList.innerHTML = "";
    return;
  }

  card.style.display = "block";
  if (empty) empty.style.display = "none";
  if (reportList) populateGeoList(reportList, reportEntries, "No GEO metrics available.");
  if (findingsList) populateGeoList(findingsList, findingsEntries, "No GEO findings recorded.");
  if (recList) populateGeoList(recList, recEntries, "No GEO recommendations.");
}

function lighthouseState(scoreValue) {
  if (scoreValue == null) return "warn";
  if (scoreValue >= 0.9) return "ok";
  if (scoreValue >= 0.5) return "warn";
  return "bad";
}

function renderLighthouseCard(lighthouse) {
  var card = $("lighthouseCard");
  if (!card) return;
  var list = $("lighthouseMetricsList");
  var scoreEl = $("lighthouseScore");
  var sourceEl = $("lighthouseSource");

  if (!lighthouse || !lighthouse.metrics) {
    card.style.display = "none";
    if (scoreEl) scoreEl.textContent = "—";
    if (list) list.innerHTML = "";
    if (sourceEl) sourceEl.textContent = "";
    return;
  }

  card.style.display = "block";
  if (scoreEl) {
    if (lighthouse.overallScore != null) {
      scoreEl.textContent = lighthouse.overallScore + "/100 (" + grade(lighthouse.overallScore) + ")";
    } else {
      scoreEl.textContent = "—";
    }
  }
  if (sourceEl) sourceEl.textContent = lighthouse.source ? lighthouse.source : "Weighted from Lighthouse log-normal/logistic curves.";

  if (list) {
    list.innerHTML = "";
    var order = ["lcp", "cls", "inp"];
    for (var i = 0; i < order.length; i++) {
      var key = order[i];
      var metric = lighthouse.metrics[key];
      if (!metric) continue;
      var li = document.createElement("li");
      li.className = lighthouseState(metric.scoreValue);

      var summary = document.createElement("div");
      summary.className = "summary";
      var label = metric.label || key.toUpperCase();
      var displayValue = metric.displayValue != null ? metric.displayValue : "—";
      summary.textContent = label + " – " + displayValue;
      li.appendChild(summary);

      var detailParts = [];
      if (metric.score != null) {
        detailParts.push("Score " + metric.score + "/100");
      }
      if (metric.earnedPoints != null && metric.points != null) {
        detailParts.push("Earned " + metric.earnedPoints + " / " + metric.points + " extension pts");
      }
      if (metric.reference) {
        var ref = metric.reference;
        detailParts.push("Curve p10 " + ref.p10 + ", median " + ref.median);
      }
      if (detailParts.length) {
        var detail = document.createElement("div");
        detail.className = "detail";
        detail.textContent = detailParts.join(" · ");
        li.appendChild(detail);
      }

      list.appendChild(li);
    }

    if (!list.children.length) {
      var empty = document.createElement("li");
      empty.className = "muted";
      empty.textContent = "Lighthouse metrics unavailable.";
      list.appendChild(empty);
    }
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

function renderMultiPageList(multi) {
  var card = $("multiPageCard");
  var list = $("multiPageList");
  if (!card || !list) return;
  if (!multi || !multi.pages || !multi.pages.length) {
    card.style.display = "none";
    list.innerHTML = "";
    return;
  }

  card.style.display = "block";
  var title = card.querySelector("h2");
  if (title) {
    title.textContent = multi.count > 1 ? "Audited pages (" + multi.count + ")" : "Audited page";
  }

  list.innerHTML = "";
  var order = ["performance","seo","geo","llm","a11y","infinite"];
  for (var i = 0; i < multi.pages.length; i++) {
    var entry = multi.pages[i];
    if (!entry) continue;
    var result = entry.result || {};
    var overall = result.overall || {};
    var score = overall.score != null ? overall.score : "—";
    var gradeVal = overall.grade || "—";
    var label = entry.label || (result.meta && result.meta.url) || entry.url || ("Page " + (i + 1));

    var li = document.createElement("li");
    li.className = "multi";

    var summary = document.createElement("div");
    summary.className = "summary";
    summary.textContent = label + " – " + score + "/100 (" + gradeVal + ")";
    li.appendChild(summary);

    var categories = result.categories || {};
    var parts = [];
    for (var j = 0; j < order.length; j++) {
      var catName = order[j];
      var cat = categories[catName];
      if (!cat || cat.score == null) continue;
      var nice = catName.charAt(0).toUpperCase() + catName.slice(1);
      parts.push(nice + " " + cat.score);
    }
    if (parts.length) {
      var detail = document.createElement("div");
      detail.className = "detail";
      detail.textContent = parts.join(" · ");
      li.appendChild(detail);
    }

    list.appendChild(li);
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
    var multiInfo = data.meta && data.meta.multi ? data.meta.multi : null;
    if (multiInfo && multiInfo.origin) {
      finalUrl = multiInfo.origin + (multiInfo.count > 1 ? " (" + multiInfo.count + " pages)" : "");
    }
    $("url").textContent = finalUrl;
    var overallScore = data.overall && data.overall.score != null ? data.overall.score : null;
    $("overallScore").textContent = overallScore != null ? overallScore : "—";
    $("overallGrade").textContent = data.overall && data.overall.grade ? data.overall.grade : "—";

    renderMultiPageList(multiInfo);

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

    if (chartDashboardCard) {
      chartDashboardCard.style.display = chartPanelsVisible ? "block" : "none";
    }

    renderLighthouseCard(data.lighthouse);
    renderGeoDeepDive(data.dom && data.dom.geo ? data.dom.geo : null, data.categories && data.categories.geo ? data.categories.geo : null);
    renderComponentInventory(data.dom && data.dom.components ? data.dom.components : null);
    renderMediaInventory(data.dom && data.dom.mediaAssets ? data.dom.mediaAssets : null);

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
