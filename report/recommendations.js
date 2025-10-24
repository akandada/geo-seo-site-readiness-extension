import { recommendationSeverityValue } from "./formatters.js";
import { $ } from "./dom.js";

export function renderRecommendations(recommendations) {
  var recList = $("recommendations");
  if (!recList) return;
  recList.innerHTML = "";
  var recData = recommendations || [];
  if (!recData.length) {
    var li0 = document.createElement("li");
    li0.className = "muted";
    li0.textContent = "No recommendations.";
    recList.appendChild(li0);
    return;
  }

  recData.sort(function(a, b){
    var diff = recommendationSeverityValue(b.severity || "medium") - recommendationSeverityValue(a.severity || "medium");
    if (diff !== 0) return diff;
    return (a.text || "").localeCompare(b.text || "");
  });
  recData.forEach(function(rec){
    if (!rec || !rec.text) return;
    var li = document.createElement("li");
    var sev = (rec.severity || "medium").toLowerCase();
    li.className = sev === "high" ? "bad" : (sev === "medium" ? "warn" : "ok");
    var summary = document.createElement("div");
    summary.className = "summary";
    var category = rec.category ? rec.category.toUpperCase() : "GENERAL";
    summary.textContent = "[" + category + "] " + rec.text;
    li.appendChild(summary);
    if (rec.sources && rec.sources.length) {
      var detail = document.createElement("div");
      detail.className = "detail";
      var srcList = rec.sources.slice(0, 5);
      var srcText = srcList.join(", ");
      if (rec.sources.length > srcList.length) {
        srcText += " +" + (rec.sources.length - srcList.length) + " more";
      }
      detail.textContent = "Pages: " + srcText;
      li.appendChild(detail);
    }
    recList.appendChild(li);
  });
}
