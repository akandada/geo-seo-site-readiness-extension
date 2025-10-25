import { formatList, formatBytes, mediaDisplayLabel, mediaUrlPath } from "./formatters.js";
import { $ } from "./dom.js";

export function renderComponentInventory(components) {
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

export function renderMediaInventory(mediaList) {
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

    var pathCell = document.createElement("td");
    var pathText = mediaUrlPath(url);
    pathCell.textContent = pathText;
    if (url && pathText && pathText !== "—") pathCell.title = url;
    row.appendChild(pathCell);

    var typeCell = document.createElement("td");
    var typeRaw = asset && asset.type ? String(asset.type).toLowerCase() : "";
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
