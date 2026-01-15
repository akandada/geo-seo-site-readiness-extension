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
  if (msg && msg.type === "OPENAI_ANALYZE_PAGE") {
    (async function () {
      try {
        var data = await fetchOpenAiReport(msg.apiKey, msg.url);
        sendResponse({ ok: true, data: data });
      } catch (err) {
        sendResponse({ ok: false, error: getErrorMessage(err) });
      }
    })();
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

function getErrorMessage(err) {
  if (!err) return "Unknown error.";
  if (typeof err === "string") return err;
  if (typeof err.message === "string") return err.message;
  try { return String(err); }
  catch (e) { return "Unknown error."; }
}

async function fetchOpenAiReport(apiKey, pageUrl) {
  if (!apiKey) throw new Error("Missing OpenAI API key.");
  if (!pageUrl) throw new Error("Missing page URL.");
  var model = "gpt-4o-mini";
  var systemPrompt = [
    "You are an expert SEO, GEO (LLM readiness), AEO (answer engine optimization), and accessibility auditor.",
    "Provide a verbose, structured report with headings and bullet lists.",
    "Include prioritized recommendations and highlight quick wins.",
    "Do not fabricate metrics; speak in terms of likely signals based on the URL."
  ].join(" ");
  var userPrompt = [
    "Analyze this page for SEO, GEO, AEO, and accessibility.",
    "Provide a verbose report with sections: Summary, SEO, GEO/LLM Readiness, AEO, Accessibility, Recommendations.",
    "Page URL: " + pageUrl
  ].join(" ");

  var payload = {
    model: model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.3,
    max_tokens: 900
  };

  var res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey
    },
    body: JSON.stringify(payload)
  });

  var json = null;
  try {
    json = await res.json();
  } catch (e) {
    throw new Error("Unable to parse OpenAI response.");
  }

  if (!res.ok) {
    var errMsg = json && json.error && json.error.message ? json.error.message : "OpenAI request failed.";
    throw new Error(errMsg);
  }

  var content = "";
  if (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) {
    content = json.choices[0].message.content;
  }
  if (!content) {
    throw new Error("OpenAI response missing content.");
  }

  return {
    status: "complete",
    content: String(content || "").trim(),
    model: model,
    url: pageUrl,
    createdAt: new Date().toISOString()
  };
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
