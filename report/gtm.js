import { $, fillChips } from "./dom.js";

function formatCellValue(value) {
  if (value === null || value === undefined) return "—";
  var str = String(value);
  if (!str.trim()) return "—";
  return str;
}

export function renderGtmInventory(gtmData) {
  var card = $("gtmCard");
  if (!card) return;

  var containers = [];
  var events = [];

  if (gtmData && typeof gtmData === "object") {
    if (Array.isArray(gtmData.containers)) {
      containers = gtmData.containers
        .filter(function(id){ return typeof id === "string" && id.trim(); })
        .map(function(id){ return id.trim(); });
    }
    if (Array.isArray(gtmData.events)) {
      events = gtmData.events.filter(function(ev){
        return ev && (ev.eventName || ev.cta || ev.action || ev.category || ev.label || ev.detail);
      });
    }
  }

  if (!containers.length && !events.length) {
    card.style.display = "none";
    return;
  }

  card.style.display = "block";

  var containerMeta = $("gtmContainerMeta");
  var containerList = $("gtmContainerList");
  if (containerMeta) {
    containerMeta.textContent = containers.length ?
      containers.length + " GTM container" + (containers.length === 1 ? "" : "s") + " detected." :
      "No GTM container IDs detected.";
  }
  if (containerList) {
    containerList.innerHTML = "";
    if (containers.length) {
      fillChips(containerList, containers, containers.length);
    } else {
      var chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = "(none)";
      containerList.appendChild(chip);
    }
  }

  var tableWrap = $("gtmEventsWrap");
  var table = $("gtmEventsTable");
  var empty = $("gtmEventsEmpty");

  if (table) {
    var tbody = table.querySelector("tbody");
    if (!tbody) {
      tbody = document.createElement("tbody");
      table.appendChild(tbody);
    }
    tbody.innerHTML = "";

    if (events.length) {
      if (tableWrap) tableWrap.style.display = "block";
      if (empty) empty.style.display = "none";
      for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        var tr = document.createElement("tr");
        var cells = [
          String(i + 1),
          formatCellValue(ev.cta),
          formatCellValue(ev.eventName),
          formatCellValue(ev.action),
          formatCellValue(ev.category),
          formatCellValue(ev.label),
          formatCellValue(ev.detail)
        ];
        for (var ci = 0; ci < cells.length; ci++) {
          var td = document.createElement("td");
          td.textContent = cells[ci];
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
    } else {
      if (tableWrap) tableWrap.style.display = "none";
      if (empty) {
        empty.style.display = "block";
        empty.textContent = "No GTM events detected.";
      }
    }
  } else if (empty) {
    empty.style.display = events.length ? "none" : "block";
    if (!events.length) empty.textContent = "No GTM events detected.";
  }
}
