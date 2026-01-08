export function grade(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function scoreColor(score) {
  if (score >= 90) return "#2aa745";
  if (score >= 75) return "#5ca2ff";
  if (score >= 60) return "#e3a008";
  return "#e63946";
}

export function recommendationSeverityValue(sev) {
  if (sev === "high") return 3;
  if (sev === "medium") return 2;
  if (sev === "low") return 1;
  return 0;
}

export function categoryLabel(name) {
  if (name === "geo") return "GEO / LLM";
  if (name === "answer") return "Answer Engine";
  if (name === "a11y") return "Accessibility";
  if (name === "seo") return "SEO";
  if (name === "performance") return "Performance";
  return name;
}

export function formatPercent(value, decimals) {
  var num = Number(value);
  if (num !== num) num = 0;
  if (decimals == null) decimals = 0;
  var factor = Math.pow(10, decimals);
  var pct = Math.round(num * 100 * factor) / factor;
  return pct.toFixed(decimals);
}

export function formatList(arr, max) {
  if (!arr || !arr.length) return "";
  var limit = typeof max === "number" && max >= 0 ? max : arr.length;
  var slice = arr.slice(0, limit);
  return slice.join(", ") + (arr.length > slice.length ? "…" : "");
}

export function formatBytes(bytes) {
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

export function formatDurationSeconds(seconds) {
  var ttl = Number(seconds);
  if (!(ttl > 0)) return "0s";
  if (ttl >= 86400) return Math.round(ttl / 86400) + "d";
  if (ttl >= 3600) return Math.round(ttl / 3600) + "h";
  if (ttl >= 60) return Math.round(ttl / 60) + "m";
  return Math.round(ttl) + "s";
}

export function mediaDisplayLabel(url) {
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

export function mediaUrlPath(url) {
  if (!url) return "—";
  if (url.indexOf("data:") === 0) return "data URI";
  try {
    var parsed = new URL(url);
    var path = parsed.pathname || "/";
    var search = parsed.search || "";
    return path + search;
  } catch (err) {
    if (url.indexOf("//") === 0) {
      try {
        var protoParsed = new URL("https:" + url);
        var protoPath = protoParsed.pathname || "/";
        var protoSearch = protoParsed.search || "";
        return protoPath + protoSearch;
      } catch (ignore) {}
    }
    if (url.charAt(0) === "/") return url;
    return "—";
  }
}

export function escapeHtml(value) {
  var s = String(value == null ? "" : value);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
