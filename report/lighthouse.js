import { grade } from "./formatters.js";
import { $ } from "./dom.js";

function lighthouseState(scoreValue) {
  if (scoreValue == null) return "warn";
  if (scoreValue >= 0.9) return "ok";
  if (scoreValue >= 0.5) return "warn";
  return "bad";
}

export function renderLighthouseCard(lighthouse) {
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
