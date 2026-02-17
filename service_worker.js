// service_worker.js — MV3 background (compat mode)
// - Strict ai.txt / llms.txt detection (no HTML/redirect false-positives)

/////////////////////////////
// Utilities and fetchers  //
/////////////////////////////

console.log("[SRA] service_worker booted");
chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
  if (msg && msg.type === "PING") {
    sendResponse({ ok: true, ts: Date.now() });
    return true;
  }
});

function headerLC(map){
  var out = {};
  if (!map) return out;
  for (var k in map) if (Object.prototype.hasOwnProperty.call(map, k)) {
    out[k.toLowerCase()] = map[k];
  }
  return out;
}

async function fetchText(url){
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const headers = Object.fromEntries(res.headers.entries());
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url, headers, text };
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
}
async function fetchContentLengthOnly(url){
  try {
    const headRes = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    const headHeaders = headerLC(Object.fromEntries(headRes.headers.entries()));
    const len = Number(headHeaders['content-length'] || headHeaders['x-file-size'] || 0);
    if (len > 0) {
      return { ok: true, status: headRes.status, bytes: len };
    }
    if (headRes.status === 405 || headRes.status === 501 || headRes.status === 400 || len <= 0) {
      try {
        const fallback = await fetch(url, { method: 'GET', redirect: 'follow' });
        const fallbackHeaders = headerLC(Object.fromEntries(fallback.headers.entries()));
        const range = fallbackHeaders['content-range'] || '';
        const match = range && range.match(/\/(\d+)$/);
        if (fallback.body && typeof fallback.body.cancel === 'function') {
          try { await fallback.body.cancel(); } catch (e) {}
        }
        if (match && match[1]) {
          const total = Number(match[1]);
          if (total > 0) {
            return { ok: true, status: fallback.status, bytes: total };
          }
        }
        const len2 = Number(fallbackHeaders['content-length'] || fallbackHeaders['x-file-size'] || 0);
        if (len2 > 0) {
          return { ok: true, status: fallback.status, bytes: len2 };
        }
        return { ok: fallback.ok, status: fallback.status, bytes: 0 };
      } catch (fallbackErr) {
        return { ok: false, status: 0, error: String(fallbackErr) };
      }
    }
    return { ok: headRes.ok, status: headRes.status, bytes: 0 };
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
}

// Require actual text file (not HTML and not a soft redirect)
function isLikelyPlainText(resp){
  if (!resp || !resp.ok) return false;
  var ct = String((resp.headers || {})['content-type'] || '').toLowerCase();
  var body = String(resp.text || '');

  if (!body) return false;

  // Must be text/plain OR some text/* that is clearly not HTML
  if (ct.startsWith('text/plain')) return true;

  if (ct.startsWith('text/')) {
    if (/(<!doctype\s*html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(body)) return false;

    // also reject if there are many angle brackets (likely markup)
    var angleCount = (body.match(/</g) || []).length;
    if (angleCount > 20) return false;

    return true;
  }

  // Some servers incorrectly label llms/ai text as octet-stream or omit the header.
  if (!ct || ct === 'application/octet-stream' || ct === 'binary/octet-stream') {
    if (/(<!doctype\s*html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(body)) return false;

    var sample = body.slice(0, 400);
    var printable = 0;
    for (var i = 0; i < sample.length; i++) {
      var code = sample.charCodeAt(i);
      if (
        code === 9 || code === 10 || code === 13 || // whitespace
        (code >= 32 && code <= 126) || // basic latin
        (code >= 160 && code <= 591)
      ) {
        printable++;
      }
    }
    if (printable >= sample.length * 0.9) {
      return true;
    }
  }

  return false;
}

// Ensure final URL path is exactly /ai.txt or /llms.txt (no redirect to / or other page)
function urlPathEquals(respUrl, expectedPath){
  try {
    var u = new URL(respUrl);
    var a = u.pathname.replace(/\/+$/,'');
    var b = expectedPath.replace(/\/+$/,'');
    return a === b;
  } catch (e) {
    return false;
  }
}

function absolutize(base, suffix){
  try {
    var u = new URL(base);
    if (suffix.startsWith('?') || suffix.startsWith('&')) {
      var b = new URL(base);
      if (suffix[0] === '?') b.search = suffix;
      else b.search += suffix;
      return b.toString();
    }
    if (suffix.startsWith('/')) return u.origin + suffix;
    return base.replace(/\/+$/,'') + '/' + suffix.replace(/^\/+/, '');
  } catch (e) {
    return null;
  }
}

/////////////////////////////
// robots.txt + headers    //
/////////////////////////////

function parseRobots(text){
  var bots = {}; var sitemaps = [];
  if (!text) return { exists:false, bots:bots, sitemaps:sitemaps, raw:"" };

  var lines = text.split(/\r?\n/);
  var curUA = null;
  for (var i=0;i<lines.length;i++){
    var ln = lines[i].trim();
    if (!ln || ln[0] === '#') continue;
    var low = ln.toLowerCase();

    if (low.indexOf('user-agent:') === 0){
      curUA = ln.split(':')[1].trim();
      bots[curUA] = bots[curUA] || { disallow: [] };
    } else if (low.indexOf('disallow:') === 0) {
      if (curUA) bots[curUA].disallow.push(ln.split(':')[1].trim());
    } else if (low.indexOf('sitemap:') === 0) {
      var sm = ln.slice(8).trim().replace(/^:/,'').trim();
      if (sm) sitemaps.push(sm);
    }
  }

  // convenience AI agents — very coarse "is everything disallowed?"
  function allowedFor(agent){
    var key = agent;
    if (bots[key] && bots[key].disallow.indexOf('/') >= 0) return false;
    if (bots['*'] && bots['*'].disallow.indexOf('/') >= 0) return false;
    return true;
  }

  return {
    exists: true,
    raw: text,
    sitemaps: sitemaps,
    bots: {
      "GPTBot": { allowed: allowedFor('GPTBot') },
      "CCBot": { allowed: allowedFor('CCBot') },
      "ClaudeBot": { allowed: allowedFor('ClaudeBot') },
      "PerplexityBot": { allowed: allowedFor('PerplexityBot') },
      "Google-Extended": { allowed: allowedFor('Google-Extended') }
    }
  };
}

function extractXRobotsTag(headers){
  if (!headers) return "";
  return headers['x-robots-tag'] || headers['x-robot-tag'] || "";
}

/////////////////////////////
// Sitemap helpers         //
/////////////////////////////

// Extract <loc> values (namespace tolerant) without DOMParser
function extractLocsFromSitemap(xmlText){
  var locs = [];
  if (!xmlText) return locs;
  var re = /<loc>\s*([^<\s][^<]*)\s*<\/loc>/gi, m;
  while ((m = re.exec(xmlText)) !== null) {
    var loc = (m[1] || '').trim();
    if (loc) locs.push(loc);
    if (locs.length > 2000) break; // safety
  }
  return Array.from(new Set(locs));
}

// Discover sitemap URLs from robots.txt + common fallbacks
async function discoverSitemapUrls(origin, robotsText){
  var list = [];
  if (robotsText) {
    var lines = robotsText.split(/\r?\n/);
    for (var i=0;i<lines.length;i++){
      var ln = lines[i].trim();
      if (!ln || ln[0] === '#') continue;
      if (ln.toLowerCase().indexOf('sitemap:') === 0){
        var url = ln.slice(8).trim().replace(/^:/,'').trim();
        if (url) list.push(url);
      }
    }
  }
  var common = [
    origin + '/sitemap.xml',
    origin + '/sitemap_index.xml',
    origin + '/sitemap-0.xml',
    origin + '/sitemap1.xml',
    origin + '/sitemap/sitemap.xml'
  ];
  common.forEach(function(u){ if (list.indexOf(u) === -1) list.push(u); });
  return list;
}




async function fetchBytesLimited(url, byteLimit){
  var limit = byteLimit && byteLimit > 0 ? byteLimit : 2 * 1024 * 1024;
  try {
    var res = await fetch(url, { redirect: 'follow' });
    var headers = headerLC(Object.fromEntries(res.headers.entries()));
    if (!res.ok) return { ok:false, status:res.status, url:res.url, headers:headers, text:'' };
    if (!res.body || !res.body.getReader) {
      var txt = await res.text();
      if (txt.length > limit) txt = txt.slice(0, limit);
      return { ok:true, status:res.status, url:res.url, headers:headers, text:txt, truncated: txt.length >= limit };
    }
    var reader = res.body.getReader();
    var chunks = [];
    var total = 0;
    while (true) {
      var r = await reader.read();
      if (r.done) break;
      if (r.value) {
        var remaining = limit - total;
        if (remaining <= 0) break;
        var part = r.value;
        if (part.length > remaining) {
          chunks.push(part.slice(0, remaining));
          total += remaining;
          break;
        }
        chunks.push(part);
        total += part.length;
      }
    }
    try { await reader.cancel(); } catch (e) {}
    var full = new Uint8Array(total);
    var offset = 0;
    for (var i=0;i<chunks.length;i++) { full.set(chunks[i], offset); offset += chunks[i].length; }
    var bytes = full;
    var ct = String(headers['content-type'] || '').toLowerCase();
    var isGzip = /\.gz($|\?)/i.test(url) || ct.indexOf('gzip') >= 0 || String(headers['content-encoding'] || '').toLowerCase().indexOf('gzip') >= 0;
    if (isGzip && typeof DecompressionStream !== 'undefined') {
      try {
        var ds = new DecompressionStream('gzip');
        var decompressedStream = new Blob([bytes]).stream().pipeThrough(ds);
        var arr = await new Response(decompressedStream).arrayBuffer();
        bytes = new Uint8Array(arr);
      } catch (e2) {}
    }
    var text = '';
    try { text = new TextDecoder('utf-8').decode(bytes); } catch (e3) { text = ''; }
    return { ok:true, status:res.status, url:res.url, headers:headers, text:text, truncated: total >= limit };
  } catch (e) {
    return { ok:false, status:0, error:String(e), text:'' };
  }
}

function classifySitemapXml(xmlText){
  var text = String(xmlText || '').toLowerCase();
  if (text.indexOf('<sitemapindex') !== -1) return 'index';
  if (text.indexOf('<urlset') !== -1) return 'urlset';
  return 'unknown';
}

function applyPatterns(urls, includePatterns, excludePatterns){
  var include = Array.isArray(includePatterns) ? includePatterns.filter(Boolean) : [];
  var exclude = Array.isArray(excludePatterns) ? excludePatterns.filter(Boolean) : [];
  function match(pattern, target) {
    try {
      if (pattern.length > 2 && pattern[0] === '/' && pattern.lastIndexOf('/') > 0) {
        var last = pattern.lastIndexOf('/');
        var body = pattern.slice(1, last);
        var flags = pattern.slice(last + 1);
        return new RegExp(body, flags).test(target);
      }
    } catch (e) {}
    return target.toLowerCase().indexOf(String(pattern).toLowerCase()) !== -1;
  }
  return urls.filter(function(u){
    var incOk = include.length ? include.some(function(p){ return match(p,u); }) : true;
    var excHit = exclude.some(function(p){ return match(p,u); });
    return incOk && !excHit;
  });
}

async function discoverSiteUrls(params){
  var origin = params && params.origin ? params.origin : '';
  var maxUrls = params && params.maxUrls ? Number(params.maxUrls) : 50;
  if (!(maxUrls > 0)) maxUrls = 50;
  if (maxUrls > 200) maxUrls = 200;
  var maxSitemaps = params && params.maxSitemaps ? Number(params.maxSitemaps) : 10;
  if (!(maxSitemaps > 0)) maxSitemaps = 10;
  if (maxSitemaps > 20) maxSitemaps = 20;
  var includePatterns = params && params.includePatterns ? params.includePatterns : [];
  var excludePatterns = params && params.excludePatterns ? params.excludePatterns : [];

  var warnings = [];
  var robots = await fetchText(origin + '/robots.txt');
  var robotsInfo = robots.ok ? parseRobots(robots.text) : { exists:false, bots:{}, sitemaps:[], raw:'' };
  var seeds = await discoverSitemapUrls(origin, robots.ok ? robots.text : '');
  var queue = seeds.slice();
  var seenSitemaps = {};
  var sitemapsUsed = [];
  var locCount = 0;
  var locLimit = 20000;
  var collected = [];
  var seenUrl = {};

  while (queue.length && sitemapsUsed.length < maxSitemaps && locCount < locLimit) {
    var sm = queue.shift();
    if (!sm || seenSitemaps[sm]) continue;
    seenSitemaps[sm] = true;
    var smRes = await fetchBytesLimited(sm, 2 * 1024 * 1024);
    if (!smRes.ok) { warnings.push('Unable to fetch sitemap: ' + sm); continue; }
    sitemapsUsed.push(smRes.url || sm);
    var kind = classifySitemapXml(smRes.text);
    var locs = extractLocsFromSitemap(smRes.text);
    for (var i=0;i<locs.length;i++) {
      var loc = locs[i];
      locCount += 1;
      if (kind === 'index' || /\.xml(\.gz)?($|\?)/i.test(loc)) {
        if (!seenSitemaps[loc] && queue.indexOf(loc) === -1 && queue.length < maxSitemaps * 3) queue.push(loc);
        continue;
      }
      try {
        var u = new URL(loc);
        if (u.origin !== origin) continue;
        var normalized = u.origin + u.pathname + u.search;
        if (!seenUrl[normalized]) {
          seenUrl[normalized] = true;
          collected.push(normalized);
        }
      } catch (e) {}
      if (collected.length >= maxUrls * 5) break;
    }
  }

  var filtered = applyPatterns(collected, includePatterns, excludePatterns);
  var truncated = filtered.length > maxUrls;
  if (!sitemapsUsed.length) warnings.push('No sitemap found or accessible.');
  return {
    origin: origin,
    robotsInfo: robotsInfo,
    sitemapsUsed: sitemapsUsed,
    urls: filtered.slice(0, maxUrls),
    truncated: truncated,
    warnings: warnings,
    discoveredCount: filtered.length
  };
}


/////////////////////////////////////////
// Message handler (popup -> background)
/////////////////////////////////////////

chrome.runtime.onMessage.addListener(function(msg, _sender, sendResponse){
  if (msg && msg.type === 'DISCOVER_SITE_URLS') {
    (async function(){
      try {
        var data = await discoverSiteUrls(msg);
        sendResponse(data);
      } catch (e) {
        sendResponse({ origin: msg && msg.origin ? msg.origin : '', robotsInfo: { exists:false, bots:{}, sitemaps:[], raw:'' }, sitemapsUsed: [], urls: [], truncated:false, warnings: ['Discovery failed: ' + String(e)] });
      }
    })();
    return true;
  } else if (msg && msg.type === 'FETCH_SITEMAP_STATUS') {
    (async function(){
      try {
        var u = msg && msg.url ? msg.url : '';
        var rs = await fetchBytesLimited(u, 2 * 1024 * 1024);
        if (!rs.ok) { sendResponse({ ok:false, status:rs.status || 0, reason:'fetch_failed' }); return; }
        var kind = classifySitemapXml(rs.text);
        sendResponse({ ok:true, status:rs.status, finalUrl: rs.url, kind: kind, truncated: !!rs.truncated });
      } catch (e) {
        sendResponse({ ok:false, status:0, reason:String(e) });
      }
    })();
    return true;
  } else if (msg && msg.type === 'COLLECT_NETWORK_INFO'){
    (async function(){
      try {
        var urlObj = new URL(msg.url);
        var origin = urlObj.origin;

        // Core fetches
        var robots     = await fetchText(origin + '/robots.txt');
        var robotsInfo = robots.ok ? parseRobots(robots.text) : { exists:false, bots:{}, sitemaps:[], raw:"" };

        var aiTxtRes   = await fetchText(origin + '/ai.txt');
        var llmsRes    = await fetchText(origin + '/llms.txt');
        var sitemapTry = await fetchText(origin + '/sitemap.xml');
        var root       = await fetchText(msg.url);

        // X-Robots-Tag header — check root first, then robots
        var xr = extractXRobotsTag(headerLC(root.headers)) || extractXRobotsTag(headerLC(robots.headers));

        // Strict ai/llms presence checks
        var aiTxtExists =
          aiTxtRes.ok &&
          aiTxtRes.status === 200 &&
          urlPathEquals(aiTxtRes.url, '/ai.txt') &&
          isLikelyPlainText(aiTxtRes);

        var llmsTxtExists =
          llmsRes.ok &&
          llmsRes.status === 200 &&
          urlPathEquals(llmsRes.url, '/llms.txt') &&
          isLikelyPlainText(llmsRes);

        // Discover and expand sitemaps
        var sitemapUrls = await discoverSitemapUrls(origin, robots.text);

        // Build response payload (netInfo)
        var netInfo = {
          url: msg.url,
          robots: robotsInfo,
          aiTxt:  { exists: aiTxtExists,  status: aiTxtRes.status,  url: aiTxtRes.url,  ct: (aiTxtRes.headers||{})['content-type'] || '' },
          llmsTxt:{ exists: llmsTxtExists, status: llmsRes.status, url: llmsRes.url, ct: (llmsRes.headers||{})['content-type'] || '' },
          sitemap: { exists: sitemapTry.ok || (sitemapUrls && sitemapUrls.length > 0) },
          headers: { xRobotsTag: xr },
          root:    { headers: headerLC(root.headers), status: root.status }
        };

        sendResponse(netInfo);
      } catch (e) {
        sendResponse({});
      }
    })();
    return true; // keep the message channel open for async response
  } else if (msg && msg.type === 'FETCH_CONTENT_LENGTH') {
    (async function(){
      try {
        var info = await fetchContentLengthOnly(msg.url);
        sendResponse(info || { ok:false });
      } catch (e) {
        sendResponse({ ok: false, status: 0, error: String(e) });
      }
    })();
    return true;
  }
});
