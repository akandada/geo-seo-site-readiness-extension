import { formatPercent } from "./formatters.js";
import { $ } from "./dom.js";

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

export function renderGeoDeepDive(geoData, geoCategory) {
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
