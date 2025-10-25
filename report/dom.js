import { escapeHtml, grade } from "./formatters.js";

export function $(id) {
  return document.getElementById(id);
}

export function cardEl(title, score, items) {
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

export function fillChips(el, items, cap) {
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

export function parseQuery() {
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
