import { categoryLabel } from "./formatters.js";
import { $ } from "./dom.js";

export function renderMultiPageList(multi) {
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
  var order = ["geo","seo","a11y","performance"];
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
      var nice = categoryLabel(catName);
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
