// service_worker.js — MV3 background (compat mode)
// - Strict ai.txt / llms.txt detection (no HTML/redirect false-positives)
// - Pagination inference from sitemap(s) to validate crawlable "page 2"

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
        const fallback = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, redirect: 'follow' });
        const fallbackHeaders = headerLC(Object.fromEntries(fallback.headers.entries()));
        const range = fallbackHeaders['content-range'] || '';
        const match = range && range.match(/\/(\d+)$/);
        if (fallback.body && typeof fallback.body.cancel === 'function') {
          try { fallback.body.cancel(); } catch (e) {}
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

  // Must be text/plain OR some text/* that is clearly not HTML
  if (ct.startsWith('text/plain')) return true;
  if (!ct.startsWith('text/')) return false;

  var body = String(resp.text || '');
  if (/(<!doctype\s*html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(body)) return false;

  // also reject if there are many angle brackets (likely markup)
  var angleCount = (body.match(/</g) || []).length;
  if (angleCount > 5) return false;

  return true;
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

// Expand sitemap indexes (sitemap of sitemaps) in a shallow way
async function expandSitemapsOnce(sitemapUrls){
  var allLocs = [];
  var childSitemaps = [];

  for (var i=0;i<sitemapUrls.length;i++){
    var u = sitemapUrls[i];
    var res = await fetchText(u);
    if (!res.ok) continue;
    var locs = extractLocsFromSitemap(res.text);
    // heuristic: many .xml(.gz) locs => likely a sitemap index
    var xmlLinks = locs.filter(function(l){ return /\.xml(\.gz)?$/i.test(l); });
    if (xmlLinks.length >= Math.min(5, locs.length)) {
      childSitemaps = childSitemaps.concat(xmlLinks);
    } else {
      allLocs = allLocs.concat(locs);
    }
  }

  // fetch a subset of child sitemaps to avoid huge crawls
  var cap = 10;
  for (var j=0; j<childSitemaps.length && j<cap; j++){
    var s = childSitemaps[j];
    var res2 = await fetchText(s);
    if (!res2.ok) continue;
    var locs2 = extractLocsFromSitemap(res2.text);
    allLocs = allLocs.concat(locs2);
  }

  // de-dupe and cap volume
  var uniq = Array.from(new Set(allLocs));
  if (uniq.length > 3000) uniq = uniq.slice(0, 3000);
  return uniq;
}

// Infer pagination patterns from URL list
function inferPaginationFromUrls(urls){
  var patterns = { queryParams: {}, pathSegments: {} };
  if (!urls || !urls.length) return patterns;

  function addQP(name, val){
    if (!patterns.queryParams[name]) patterns.queryParams[name] = { values: {}, step: null };
    patterns.queryParams[name].values[val] = true;
  }
  function setPathKey(key){ patterns.pathSegments[key] = true; }

  urls.forEach(function(u){
    try {
      var url = new URL(u);
      // query params e.g., ?page=2, ?offset=20
      url.searchParams.forEach(function(val, key){
        var v = parseInt(val, 10);
        if (!isNaN(v) && /^(page|p|pg|pagination|offset|start|skip|from|begin)$/i.test(key)) {
          addQP(key.toLowerCase(), v);
        }
      });
      // path-based pagination e.g., /page/2 or /p/3
      var segs = url.pathname.split('/').filter(Boolean);
      for (var i=0;i<segs.length-1;i++){
        var seg = segs[i].toLowerCase();
        var nxt = segs[i+1];
        var n = parseInt(nxt, 10);
        if (!isNaN(n) && (seg === 'page' || seg === 'p')) {
          setPathKey(seg);
        }
      }
    } catch (e) {}
  });

  // Estimate steps for query params (e.g., offset 0 -> 20 -> 40 => step 20)
  Object.keys(patterns.queryParams).forEach(function(name){
    var values = Object.keys(patterns.queryParams[name].values)
      .map(function(v){ return parseInt(v,10); })
      .sort(function(a,b){ return a-b; });
    var step = null;
    for (var i=1;i<values.length;i++){
      var diff = values[i] - values[i-1];
      if (diff > 0) { step = diff; break; }
    }
    patterns.queryParams[name].step = step || 20; // default guess
  });

  return patterns;
}

// Build "page 2" guesses for the *current* URL using inferred patterns
function buildPage2Guesses(currentUrl, patterns){
  var out = [];
  try {
    var base = new URL(currentUrl);

    // Query param patterns
    Object.keys(patterns.queryParams || {}).forEach(function(name){
      var info = patterns.queryParams[name];
      var u = new URL(base.toString());
      if (u.searchParams.has(name)) {
        var prev = parseInt(u.searchParams.get(name), 10);
        if (isNaN(prev)) prev = (name==='offset'||name==='start'||name==='skip'||name==='from'||name==='begin') ? 0 : 1;
        var nextVal = (name==='offset'||name==='start'||name==='skip'||name==='from'||name==='begin')
          ? (prev + (info.step || 20))
          : (prev + 1);
        u.searchParams.set(name, String(nextVal));
      } else {
        var initVal = (name==='offset'||name==='start'||name==='skip'||name==='from'||name==='begin')
          ? (info.step || 20)
          : 2;
        u.searchParams.set(name, String(initVal));
      }
      out.push(u.toString());
    });

    // Path segment patterns (/page/2 or /p/2)
    Object.keys(patterns.pathSegments || {}).forEach(function(segKey){
      var u2 = new URL(base.toString());
      var path = u2.pathname.replace(/\/+$/,'');
      var rx = new RegExp('(?:^|/)'+ segKey + '/(\\d+)(?:/|$)','i');
      if (rx.test(path)) {
        path = path.replace(rx, function(_m, num){
          var n = parseInt(num, 10); if (isNaN(n)) n = 1;
          return '/' + segKey + '/' + (n+1) + '/';
        });
      } else {
        path = path + '/' + segKey + '/2';
      }
      u2.pathname = path;
      out.push(u2.toString());
    });

    // De-dupe and cap
    var seen = {}; var uniq = [];
    for (var i=0;i<out.length;i++){
      var u = out[i];
      if (!seen[u]) { uniq.push(u); seen[u] = true; }
    }
    return uniq.slice(0, 12);
  } catch (e) {
    return out;
  }
}

/////////////////////////////////////////
// Message handler (popup -> background)
/////////////////////////////////////////

chrome.runtime.onMessage.addListener(function(msg, _sender, sendResponse){
  if (msg && msg.type === 'COLLECT_NETWORK_INFO'){
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

        // Discover and expand sitemaps (for pagination inference)
        var sitemapUrls = await discoverSitemapUrls(origin, robots.text);
        var allLocs = await expandSitemapsOnce(sitemapUrls);
        var patterns = inferPaginationFromUrls(allLocs);

        // Build guesses for "page 2" based on patterns; fallback to generic
        var guesses = buildPage2Guesses(msg.url, patterns);
        if (!guesses || !guesses.length){
          guesses = ['?page=2','&page=2','/page/2','?p=2','&p=2','?pg=2','&pg=2','?offset=20','&offset=20','/p/2']
            .map(function(s){ return absolutize(msg.url, s); })
            .filter(Boolean);
        }

        // Try to fetch one working "page 2"
        var paginationFetch = { ok:false };
        for (var i=0;i<guesses.length;i++){
          var href = guesses[i];
          var pg = await fetchText(href);
          if (pg.ok && pg.text && pg.text.length > 2000 && !/<html[^>]*>\s*<\/html>/i.test(pg.text)) {
            paginationFetch = { ok:true, url:href, status: pg.status };
            break;
          }
        }

        // Build response payload (netInfo)
        var netInfo = {
          url: msg.url,
          robots: robotsInfo,
          aiTxt:  { exists: aiTxtExists,  status: aiTxtRes.status,  url: aiTxtRes.url,  ct: (aiTxtRes.headers||{})['content-type'] || '' },
          llmsTxt:{ exists: llmsTxtExists, status: llmsRes.status, url: llmsRes.url, ct: (llmsRes.headers||{})['content-type'] || '' },
          sitemap: { exists: sitemapTry.ok || (sitemapUrls && sitemapUrls.length > 0) },
          headers: { xRobotsTag: xr },
          root:    { headers: headerLC(root.headers), status: root.status },
          paginationFetch: paginationFetch,
          paginationDerived: {
            sitemapSeeds: sitemapUrls,
            patternSampleCounts: {
              queryParams: Object.keys(patterns.queryParams || {}).length,
              pathSegments: Object.keys(patterns.pathSegments || {}).length
            },
            guessesTried: guesses.slice(0, 6)
          }
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
