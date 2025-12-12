// content.js — DOM information collector

function q(sel) { return document.querySelector(sel) }
function qa(sel) { return Array.from(document.querySelectorAll(sel)) }
function getMeta(name) { return q(`meta[name="${name}"]`)?.getAttribute('content') || '' }
function getHeader(name) { return q(`meta[http-equiv="${name}"]`)?.getAttribute('content') || '' }
function metaRobots() { const v = (getMeta('robots') || getHeader('X-Robots-Tag') || '').toLowerCase(); return v; }
function pageTitle() { return (document.title || '').trim(); }
function metaDescription() { return (getMeta('description') || '').trim(); }
function countJsonLd() { return qa('script[type="application/ld+json"]').length }
function ogCount() { return qa('meta[property^="og:"]').length }
function twitterCount() { return qa('meta[name^="twitter:"]').length }
function titleOk() { const t = (document.title || '').trim(); return t.length >= 10 && t.length <= 70; }
function metaDescOk() { const d = getMeta('description') || ''; const len = d.trim().length; return len >= 50 && len <= 160; }
function h1Count() { return qa('h1').length }
function imgWithoutAlt() { return qa('img').filter(img => !(img.getAttribute('alt') || '').trim()).length }
function langOk() { return !!(document.documentElement.getAttribute('lang') || '').trim() }
function htmlLang() { return (document.documentElement.getAttribute('lang') || '').trim(); }
function canonical() { return q('link[rel="canonical"]')?.href || '' }
function hreflangLinks() {
  try {
    var links = qa('link[rel="alternate"][hreflang]');
    var langs = {};
    var samples = [];
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var lang = (link.getAttribute('hreflang') || '').trim().toLowerCase();
      var href = (link.getAttribute('href') || '').trim();
      if (!lang || !href) continue;
      langs[lang] = (langs[lang] || 0) + 1;
      if (samples.length < 5) {
        samples.push({ lang: lang, href: href });
      }
    }
    var uniqueLangs = Object.keys(langs);
    var duplicateLangs = uniqueLangs.filter(function (l) { return langs[l] > 1; });
    return {
      count: links.length,
      uniqueLangs: uniqueLangs,
      duplicateLangs: duplicateLangs,
      samples: samples
    };
  } catch (e) {
    return { count: 0, uniqueLangs: [], duplicateLangs: [], samples: [] };
  }
}
function mainWordCount() { const clone = document.body.cloneNode(true); clone.querySelectorAll('script,style,nav,footer,header,form,aside').forEach(n => n.remove()); const text = (clone.innerText || '').replace(/\s+/g, ' ').trim(); return text.split(' ').filter(Boolean).length; }
const GEO_STOPWORDS = new Set(['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'is', 'are', 'was', 'were', 'had', 'has', 'were', 'your', 'can', 'our', 'more', 'about']);
function countSyllables(word) {
  try {
    var w = (word || '').toLowerCase().replace(/[^a-z\u00c0-\u017f]/g, '');
    if (!w) return 0;
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    w = w.replace(/^y/, '');
    var matches = w.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  } catch (e) { return 0; }
}
function analyzeGeoContent() {
  try {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,svg,canvas,nav,footer,header,form,aside').forEach(n => n.remove());
    const text = (clone.innerText || '').replace(/\s+/g, ' ').trim();
    const wordsOriginal = (text.match(/[A-Za-z\u00C0-\u017F']+/g) || []);
    const words = wordsOriginal.map(w => w.toLowerCase().replace(/'/g, ''));
    const wordsFiltered = words.filter(Boolean);
    const totalWords = wordsFiltered.length;
    const uniqueWordCount = Array.from(new Set(wordsFiltered)).length;
    const uniqueWordRatio = totalWords ? uniqueWordCount / totalWords : 0;

    const freq = {};
    var topWord = '';
    var topCount = 0;
    for (var i = 0; i < wordsFiltered.length; i++) {
      var token = wordsFiltered[i];
      if (!token || GEO_STOPWORDS.has(token)) continue;
      freq[token] = (freq[token] || 0) + 1;
      if (freq[token] > topCount) {
        topCount = freq[token];
        topWord = token;
      }
    }
    const topWordRatio = totalWords ? topCount / totalWords : 0;

    const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const sentenceCount = sentences.length;
    var syllableSum = 0;
    for (var j = 0; j < wordsOriginal.length; j++) syllableSum += countSyllables(wordsOriginal[j]);
    const avgSentenceLength = sentenceCount ? (totalWords / sentenceCount) : 0;
    const syllablesPerWord = totalWords ? (syllableSum / totalWords) : 0;
    const flesch = (sentenceCount && totalWords) ? (206.835 - 1.015 * avgSentenceLength - 84.6 * syllablesPerWord) : 0;

    const capitalizedSentences = sentences.filter(function (s) { return /^[A-Z0-9\u00C0-\u017F]/.test(s); }).length;
    const capitalizedRatio = sentenceCount ? capitalizedSentences / sentenceCount : 0;

    const longWords = wordsOriginal.filter(function (w) { return w.length >= 9; }).length;
    const technicalTerms = wordsOriginal.filter(function (w) { return /(?:ization|isation|ology|metric|engine|network|algorithm|platform|compliance|optimization)$/i.test(w) || /^[A-Z]{3,}$/.test(w); }).length;
    const technicalTermRatio = totalWords ? (technicalTerms + longWords * 0.5) / totalWords : 0;

    const doc = document;
    const headings = doc.querySelectorAll('h2, h3').length;
    const listItems = doc.querySelectorAll('ul li, ol li').length;
    const hasTable = !!doc.querySelector('table');
    const hasEmphasis = !!doc.querySelector('strong, b, em, mark');

    const anchors = Array.from(doc.querySelectorAll('a[href]'));
    const originHost = (location && location.hostname) ? location.hostname.replace(/^www\./, '') : '';
    var externalLinks = [];
    var authorityLinks = [];
    anchors.forEach(function (a) {
      var href = a.getAttribute('href') || '';
      try {
        var u = new URL(href, location.href);
        var host = (u.hostname || '').replace(/^www\./, '');
        var isExternal = !!originHost && host && host !== originHost;
        if (isExternal) {
          externalLinks.push(host);
          if (/\.(gov|edu)$/i.test(host) || /(journal|research|study|report|whitepaper)/i.test(a.textContent || '')) {
            authorityLinks.push(host);
          }
        }
      } catch (e) { /* ignore */ }
    });

    const quoteMatches = (text.match(/"[^"\n]{3,}"/g) || []).length;
    const blockQuoteMatches = doc.querySelectorAll('blockquote, q').length;
    const quoteCount = quoteMatches + blockQuoteMatches;

    const statsMatches = (text.match(/\b\d+(?:[\.,]\d+)?\s?(?:%|percent|per\s?cent|million|billion|thousand|k|\bof\b|times)\b/gi) || []).length;

    return {
      totalWords: totalWords,
      uniqueWordCount: uniqueWordCount,
      uniqueWordRatio: uniqueWordRatio,
      topWord: { word: topWord, count: topCount, ratio: topWordRatio },
      readability: {
        flesch: flesch,
        sentences: sentenceCount,
        avgSentenceLength: avgSentenceLength,
        syllablesPerWord: syllablesPerWord
      },
      fluency: {
        capitalizedRatio: capitalizedRatio
      },
      technicalTermRatio: technicalTermRatio,
      structure: {
        headings: headings,
        listItems: listItems,
        hasTable: hasTable,
        hasEmphasis: hasEmphasis,
        richFormatting: (headings >= 2) || (listItems > 4) || hasTable || hasEmphasis
      },
      externalLinkCount: externalLinks.length,
      citationAuthorityCount: authorityLinks.length,
      citationAuthoritySamples: authorityLinks.slice(0, 3),
      quoteCount: quoteCount,
      statsCount: statsMatches
    };
  } catch (e) {
    return {
      totalWords: 0,
      uniqueWordCount: 0,
      uniqueWordRatio: 0,
      topWord: { word: '', count: 0, ratio: 0 },
      readability: { flesch: 0, sentences: 0, avgSentenceLength: 0, syllablesPerWord: 0 },
      fluency: { capitalizedRatio: 0 },
      technicalTermRatio: 0,
      structure: { headings: 0, listItems: 0, hasTable: false, hasEmphasis: false, richFormatting: false },
      externalLinkCount: 0,
      citationAuthorityCount: 0,
      citationAuthoritySamples: [],
      quoteCount: 0,
      statsCount: 0
    };
  }
}

function extractJsonLdAnswerSignals() {
  var result = {
    count: 0,
    errors: 0,
    faqSchema: false,
    qaSchema: false,
    howToSchema: false,
    speakableSchema: false,
    breadcrumbSchema: false
  };
  function markType(type) {
    if (!type) return;
    var t = String(type).toLowerCase();
    if (t.indexOf("faqpage") >= 0) result.faqSchema = true;
    if (t === "question" || t === "faquestion" || t.indexOf("question") >= 0) result.faqSchema = true;
    if (t.indexOf("qapage") >= 0) result.qaSchema = true;
    if (t.indexOf("howto") >= 0) result.howToSchema = true;
    if (t.indexOf("speakable") >= 0) result.speakableSchema = true;
    if (t.indexOf("breadcrumb") >= 0) result.breadcrumbSchema = true;
  }
  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) {
        walk(node[i]);
      }
      return;
    }
    if (typeof node === "object") {
      var typeVal = node["@type"];
      if (Array.isArray(typeVal)) {
        for (var j = 0; j < typeVal.length; j++) {
          markType(typeVal[j]);
        }
      } else if (typeVal) {
        markType(typeVal);
      }
      if (!result.speakableSchema && node.speakable != null) {
        result.speakableSchema = true;
      }
      for (var key in node) {
        if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
        var value = node[key];
        if (value && typeof value === "object") {
          walk(value);
        }
      }
    }
  }

  try {
    var scripts = qa('script[type="application/ld+json"]');
    result.count = scripts.length;
    for (var i = 0; i < scripts.length; i++) {
      var script = scripts[i];
      if (!script) continue;
      var text = script.textContent || script.innerText || "";
      if (!text) continue;
      try {
        var json = JSON.parse(text);
        walk(json);
      } catch (err) {
        result.errors += 1;
        var trimmed = text.trim();
        if (trimmed.charAt(0) === "{" && trimmed.charAt(trimmed.length - 1) === "}") {
          try {
            var wrapped = "[" + trimmed.replace(/}\s*{/, "},{") + "]";
            var fallback = JSON.parse(wrapped);
            walk(fallback);
          } catch (ignore) { }
        }
      }
    }
  } catch (e) {
    result.errors += 1;
  }
  return result;
}

function detectAnswerEngineSignals() {
  try {
    var main = document.querySelector('main, article, [role="main"]');
    if (!main) main = document.body || document.documentElement;
    var listNodes = Array.from(main.querySelectorAll('ul, ol')).slice(0, 30);
    var keyPhrase = /(key\s*takeaway|key\s*points|summary|highlights|quick facts|at a glance|overview|in brief)/i;
    var summaryListCount = 0;
    var summaryNearTop = false;
    for (var liIdx = 0; liIdx < listNodes.length; liIdx++) {
      var list = listNodes[liIdx];
      if (!list) continue;
      var items = list.querySelectorAll('li');
      if (items.length < 3) continue;
      summaryListCount++;
      var labelText = "";
      var prev = list.previousElementSibling;
      if (prev) {
        labelText += (prev.textContent || "");
      }
      labelText += " " + (list.getAttribute('aria-label') || "");
      labelText += " " + (list.getAttribute('data-title') || "");
      var combined = (labelText + " " + (list.textContent || "")).replace(/\s+/g, ' ').trim();
      if (keyPhrase.test(combined)) summaryNearTop = true;
      if (typeof list.getBoundingClientRect === 'function') {
        var rect = list.getBoundingClientRect();
        if (rect && rect.top >= 0 && rect.top < 800) {
          summaryNearTop = true;
        }
      }
    }

    var headings = Array.from(main.querySelectorAll('h2, h3, h4, h5')).slice(0, 60);
    var questionHeadingCount = 0;
    var questionRegex = /^(who|what|when|where|why|how|can|does|is|are|should|will|do|did|could|would|may|might|which)\b/i;
    for (var hIdx = 0; hIdx < headings.length; hIdx++) {
      var heading = headings[hIdx];
      if (!heading) continue;
      var text = (heading.textContent || "").replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (text.charAt(text.length - 1) === '?' || questionRegex.test(text)) {
        questionHeadingCount++;
      }
    }

    var detailsNodes = Array.from(main.querySelectorAll('details')).slice(0, 40);
    var faqAccordionCount = 0;
    for (var dIdx = 0; dIdx < detailsNodes.length; dIdx++) {
      var det = detailsNodes[dIdx];
      if (!det) continue;
      var summary = det.querySelector('summary');
      var text = summary ? (summary.textContent || "") : "";
      var combinedText = (text + " " + (det.getAttribute('class') || "")).toLowerCase();
      if (questionRegex.test(text) || /faq|q&a|question|answer/.test(combinedText)) {
        faqAccordionCount++;
      }
    }

    var microdataFaq = main.querySelectorAll('[itemtype*="FAQPage"], [itemtype*="Question"], [itemtype*="HowTo"]');

    var anchorLinks = Array.from(main.querySelectorAll('a[href^="#"]')).filter(function (a) {
      if (!a) return false;
      var href = a.getAttribute('href') || '';
      if (!href || href === '#' || href.toLowerCase() === '#top') return false;
      return true;
    });
    var tocDetected = false;
    if (anchorLinks.length >= 3) {
      for (var aIdx = 0; aIdx < anchorLinks.length; aIdx++) {
        var anchor = anchorLinks[aIdx];
        if (!anchor || typeof anchor.getBoundingClientRect !== 'function') continue;
        var rect = anchor.getBoundingClientRect();
        if (rect && rect.top >= 0 && rect.top < 700) {
          tocDetected = true;
          break;
        }
      }
    }

    var calloutSelectors = 'aside, .callout, .summary-box, .key-points, .highlights, .important';
    var callouts = Array.from(main.querySelectorAll(calloutSelectors)).filter(function (node) {
      var text = (node.textContent || "").replace(/\s+/g, ' ').trim();
      if (!text) return false;
      return keyPhrase.test(text) || /answer|summary|takeaway|in summary|tl;dr/i.test(text);
    });

    var structured = extractJsonLdAnswerSignals();

    return {
      faqSchema: structured.faqSchema,
      qaSchema: structured.qaSchema,
      howToSchema: structured.howToSchema,
      speakableSchema: structured.speakableSchema,
      breadcrumbSchema: structured.breadcrumbSchema,
      jsonLdCount: structured.count,
      jsonLdErrors: structured.errors,
      faqMicrodataCount: microdataFaq.length,
      faqAccordionCount: faqAccordionCount,
      questionHeadingCount: questionHeadingCount,
      keyTakeawayLists: summaryListCount,
      hasSummaryList: summaryNearTop || callouts.length > 0,
      calloutCount: callouts.length,
      hasTableOfContents: tocDetected
    };
  } catch (e) {
    return {
      faqSchema: false,
      qaSchema: false,
      howToSchema: false,
      speakableSchema: false,
      breadcrumbSchema: false,
      jsonLdCount: 0,
      jsonLdErrors: 1,
      faqMicrodataCount: 0,
      faqAccordionCount: 0,
      questionHeadingCount: 0,
      keyTakeawayLists: 0,
      hasSummaryList: false,
      calloutCount: 0,
      hasTableOfContents: false
    };
  }
}
function resourceHints() { return { preconnect: qa('link[rel=\"preconnect\"]').length, preload: qa('link[rel=\"preload\"]').length, dnsPrefetch: qa('link[rel=\"dns-prefetch\"]').length }; }
function imageStats() {
  const allImages = qa('img');
  const total = allImages.length || 1;
  let modernFormatCount = 0;
  let lazyCount = 0;
  let responsiveCount = 0;

  allImages.forEach(img => {
    // 1. Check for modern format by extension
    const src = img.src || '';
    if (src.match(/\.(avif|webp)(\?|$)/i)) {
      modernFormatCount++;
    }

    // 2. Check for lazy loading
    if ((img.getAttribute('loading') || '').toLowerCase() === 'lazy') {
      lazyCount++;
    }

    // 3. Check for responsiveness signals (srcset or parent <picture>)
    if (img.getAttribute('srcset')) {
      responsiveCount++;
    } else if (img.parentElement && img.parentElement.tagName.toLowerCase() === 'picture') {
      responsiveCount++;
    }
    // Also count images inside <picture> with modern <source> tags
    const parentPicture = img.parentElement;
    if (parentPicture && parentPicture.tagName.toLowerCase() === 'picture') {
      const sources = parentPicture.querySelectorAll('source');
      if (Array.from(sources).some(s => (s.getAttribute('type') || '').toLowerCase().indexOf('image/webp') > -1 || (s.getAttribute('type') || '').toLowerCase().indexOf('image/avif') > -1)) {
        modernFormatCount++; // Double count if the modern source tag exists
      }
    }
  });

  return {
    count: allImages.length,
    modernPct: (modernFormatCount / total) * 100,
    lazyPct: (lazyCount / total) * 100,
    responsivePct: (responsiveCount / total) * 100, // New metric
  };
}
function fontStats() { const styles = qa('style, link[rel=\"stylesheet\"]'); let haveDisplay = false; styles.forEach(s => { const txt = s.tagName === 'STYLE' ? s.textContent : ''; if (txt && /font-display\\s*:\\s*(swap|optional)/i.test(txt)) haveDisplay = true; }); return { haveDisplay }; }

function normalizeMediaUrl(url) {
  if (!url) return '';
  try {
    var absolute = new URL(url, location.href);
    absolute.hash = '';
    return absolute.href;
  } catch (e) {
    return url;
  }
}
function estimateDataUriSize(uri) {
  if (!uri || uri.indexOf('data:') !== 0) return 0;
  const comma = uri.indexOf(',');
  if (comma < 0) return 0;
  const meta = uri.slice(0, comma);
  const data = uri.slice(comma + 1);
  if (/;base64/i.test(meta)) {
    const len = data.length;
    return Math.floor(len * 0.75);
  }
  try {
    return decodeURIComponent(data).length;
  } catch (e) {
    return data.length;
  }
}
function requestContentLength(url) {
  return new Promise(resolve => {
    if (!url) {
      resolve(0);
      return;
    }
    if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
      resolve(0);
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: 'FETCH_CONTENT_LENGTH', url: url }, resp => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          resolve(0);
          return;
        }
        if (resp && resp.ok && resp.bytes && resp.bytes > 0) {
          const num = Number(resp.bytes);
          resolve(num > 0 ? num : 0);
          return;
        }
        resolve(0);
      });
    } catch (err) {
      resolve(0);
    }
  });
}
async function collectMediaAssets() {
  try {
    const allowedTypes = { img: true, image: true, video: true, audio: true, media: true, iframe: true };
    let resourceEntries = [];
    try {
      if (typeof performance !== 'undefined' && performance && typeof performance.getEntriesByType === 'function') {
        resourceEntries = performance.getEntriesByType('resource');
      }
    } catch (e) {
      resourceEntries = [];
    }
    resourceEntries = Array.isArray(resourceEntries) ? resourceEntries : Array.from(resourceEntries || []);

    const resourceMap = {};
    const originalMap = {};
    for (let i = 0; i < resourceEntries.length; i++) {
      const entry = resourceEntries[i];
      if (!entry) continue;
      const initiator = String(entry.initiatorType || '').toLowerCase();
      if (!allowedTypes[initiator]) continue;
      let size = 0;
      const transfer = Number(entry.transferSize || 0);
      if (transfer > size) size = transfer;
      const encoded = Number(entry.encodedBodySize || 0);
      if (encoded > size) size = encoded;
      const decoded = Number(entry.decodedBodySize || 0);
      if (decoded > size) size = decoded;
      const name = entry.name || '';
      const norm = normalizeMediaUrl(name);
      if (norm) {
        if (!resourceMap[norm] || resourceMap[norm].size < size) {
          resourceMap[norm] = { size: size, type: initiator || 'media', name: name };
        }
      }
      if (name && (!originalMap[name] || originalMap[name].size < size)) {
        originalMap[name] = { size: size, type: initiator || 'media', name: name };
      }
    }

    const nodes = qa('img, video, audio, iframe');
    const aggregate = {};
    for (let ni = 0; ni < nodes.length; ni++) {
      const el = nodes[ni];
      if (!el || !el.tagName) continue;
      const tag = (el.tagName || '').toLowerCase();
      let src = '';
      if (tag === 'img' || tag === 'video' || tag === 'audio') {
        src = el.currentSrc || el.src || '';
      } else if (tag === 'iframe') {
        src = el.src || '';
      }
      if (!src) continue;
      const key = normalizeMediaUrl(src) || src;
      if (!aggregate[key]) {
        aggregate[key] = {
          url: src,
          type: tag,
          bytes: 0,
          displayWidth: null,
          displayHeight: null,
          naturalWidth: null,
          naturalHeight: null,
          occurrences: 0
        };
      }
      const entryObj = aggregate[key];
      if (!entryObj.type && tag) entryObj.type = tag;
      entryObj.occurrences += 1;
      const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
      if (rect) {
        const w = Math.round(Math.max(rect.width || 0, 0));
        const h = Math.round(Math.max(rect.height || 0, 0));
        if (w > 0 && (entryObj.displayWidth == null || w > entryObj.displayWidth)) entryObj.displayWidth = w;
        if (h > 0 && (entryObj.displayHeight == null || h > entryObj.displayHeight)) entryObj.displayHeight = h;
      }
      if (tag === 'img') {
        if (el.naturalWidth && (entryObj.naturalWidth == null || el.naturalWidth > entryObj.naturalWidth)) entryObj.naturalWidth = el.naturalWidth;
        if (el.naturalHeight && (entryObj.naturalHeight == null || el.naturalHeight > entryObj.naturalHeight)) entryObj.naturalHeight = el.naturalHeight;
      } else if (tag === 'video') {
        if (el.videoWidth && (entryObj.naturalWidth == null || el.videoWidth > entryObj.naturalWidth)) entryObj.naturalWidth = el.videoWidth;
        if (el.videoHeight && (entryObj.naturalHeight == null || el.videoHeight > entryObj.naturalHeight)) entryObj.naturalHeight = el.videoHeight;
      }
    }

    const results = [];
    for (const key in aggregate) {
      if (!Object.prototype.hasOwnProperty.call(aggregate, key)) continue;
      const agg = aggregate[key];
      const match = resourceMap[key] || originalMap[agg.url] || null;
      if (match && match.size != null && match.size > agg.bytes) {
        agg.bytes = match.size;
      }
      if (match && match.type && !agg.type) {
        agg.type = match.type;
      }
      if (!agg.bytes && agg.url && agg.url.indexOf('data:') === 0) {
        agg.bytes = estimateDataUriSize(agg.url);
      }
      results.push({
        url: agg.url,
        type: agg.type,
        bytes: agg.bytes,
        displayWidth: agg.displayWidth,
        displayHeight: agg.displayHeight,
        naturalWidth: agg.naturalWidth,
        naturalHeight: agg.naturalHeight,
        occurrences: agg.occurrences
      });
    }

    for (const resKey in resourceMap) {
      if (!Object.prototype.hasOwnProperty.call(resourceMap, resKey)) continue;
      if (aggregate[resKey]) continue;
      const perfEntry = resourceMap[resKey];
      results.push({
        url: perfEntry && perfEntry.name ? perfEntry.name : resKey,
        type: perfEntry && perfEntry.type ? perfEntry.type : 'media',
        bytes: perfEntry && perfEntry.size ? perfEntry.size : 0,
        displayWidth: null,
        displayHeight: null,
        naturalWidth: null,
        naturalHeight: null,
        occurrences: 0
      });
    }

    const fallbackTargets = [];
    for (let fi = 0; fi < results.length && fallbackTargets.length < 15; fi++) {
      const candidate = results[fi];
      if (!candidate) continue;
      if (candidate.bytes && candidate.bytes > 0) continue;
      if (!candidate.url || candidate.url.indexOf('data:') === 0) continue;
      fallbackTargets.push(candidate);
    }

    for (let ti = 0; ti < fallbackTargets.length; ti++) {
      const asset = fallbackTargets[ti];
      const fetched = await requestContentLength(asset.url);
      if (fetched && fetched > asset.bytes) {
        asset.bytes = fetched;
      }
    }

    results.sort((a, b) => {
      const aSize = a && a.bytes ? a.bytes : 0;
      const bSize = b && b.bytes ? b.bytes : 0;
      if (bSize !== aSize) return bSize - aSize;
      const aUrl = a && a.url ? a.url : '';
      const bUrl = b && b.url ? b.url : '';
      return aUrl.localeCompare(bUrl);
    });

    if (results.length > 40) return results.slice(0, 40);
    return results;
  } catch (e) {
    return [];
  }
}
function isPaginationHref(href) {
  if (!href) return false;
  var trimmed = href.trim();
  if (!trimmed) return false;
  if (/[?&](?:page|paged|page_no|page_num|pageno|pagenum|pageindex|pagenumber|p|pg|pagination|start|offset|skip|from|begin)=\d+/i.test(trimmed)) return true;
  if (/[?&][a-z0-9_-]*page[a-z0-9_-]*=\d+/i.test(trimmed)) return true;
  if (/\/(?:page|paged|p|pg|pagination)[-_/]?\d+(?:[/?#]|$)/i.test(trimmed)) return true;
  return false;
}
function discoverPagination() {
  try {
    var candidates = qa('a[href]');
    var hrefs = [];
    for (var i = 0; i < candidates.length; i++) {
      var a = candidates[i];
      if (!a) continue;
      var h = a.getAttribute('href');
      if (isPaginationHref(h)) hrefs.push(h.trim());
      if (hrefs.length >= 20) break;
    }
    var relLinks = qa('link[rel="next"], link[rel="prev"]');
    for (var j = 0; j < relLinks.length; j++) {
      var relHref = relLinks[j] && relLinks[j].getAttribute('href');
      if (isPaginationHref(relHref)) hrefs.push(relHref.trim());
    }
    var unique = Array.from(new Set(hrefs)).slice(0, 10);
    var navVisible = !!q('nav[aria-label*="pagination" i], ul.pagination, .pagination, a[rel="next"], a[rel="prev"]');
    var relNextPrev = relLinks.length > 0;
    return { visible: navVisible, relNextPrev: relNextPrev, links: unique };
  } catch (e) {
    return { visible: false, relNextPrev: false, links: [] };
  }
}
function describeNodeLabel(node) {
  try {
    const tag = (node.tagName || '').toLowerCase();
    const id = (node.getAttribute('id') || '').trim();
    const classes = (node.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    const aria = (node.getAttribute('aria-label') || '').trim();
    const role = (node.getAttribute('role') || '').trim();
    const dataName = (node.getAttribute('data-component') || node.getAttribute('data-module') || node.getAttribute('data-widget') || node.getAttribute('data-testid') || node.getAttribute('data-qa') || '').trim();
    let label = tag || 'element';
    if (id) {
      label += '#' + id;
    } else if (classes.length) {
      label += '.' + classes.join('.');
    } else if (dataName) {
      label += '[' + dataName.slice(0, 40) + (dataName.length > 40 ? '…' : '') + ']';
    } else if (aria) {
      label += '[' + aria.slice(0, 40) + (aria.length > 40 ? '…' : '') + ']';
    } else if (role) {
      label += '(' + role + ')';
    }
    return label;
  } catch (e) {
    return 'element';
  }
}
function countInteractive(node) {
  const interactiveSel = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], [role="menuitem"]';
  return node.querySelectorAll(interactiveSel).length;
}
function extractHeadings(node) {
  const headings = Array.from(node.querySelectorAll('h1,h2,h3,h4,h5,h6')).slice(0, 5);
  return headings.map(h => {
    const text = (h.innerText || '').replace(/\s+/g, ' ').trim();
    return text.slice(0, 80) + (text.length > 80 ? '…' : '');
  });
}
function listDataAttributes(node) {
  const out = [];
  if (!node || !node.attributes) return out;
  const max = Math.min(node.attributes.length, 10);
  for (let i = 0; i < max; i++) {
    const attr = node.attributes[i];
    if (!attr) continue;
    const name = attr.name || '';
    if (name.indexOf('data-') !== 0) continue;
    const value = (attr.value || '').trim();
    out.push({ name, value: value.slice(0, 80) + (value.length > 80 ? '…' : '') });
    if (out.length >= 6) break;
  }
  return out;
}
function computeComponentReport(node) {
  try {
    const label = describeNodeLabel(node);
    const tag = (node.tagName || '').toLowerCase();
    const role = (node.getAttribute('role') || '').trim();
    const depth = (function () {
      let d = 0;
      let cur = node;
      while (cur && cur !== document.body && d < 40) {
        cur = cur.parentElement;
        d++;
      }
      return d;
    })();

    const rect = typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null;
    const area = rect ? Math.round(Math.max(0, rect.width) * Math.max(0, rect.height)) : null;

    const textRaw = (node.innerText || '').replace(/\s+/g, ' ').trim();
    const words = textRaw ? textRaw.split(' ').filter(Boolean).length : 0;
    const textPreview = textRaw ? textRaw.slice(0, 200) + (textRaw.length > 200 ? '…' : '') : '';

    const headings = extractHeadings(node);
    const headingCount = headings.length;

    const linkNodes = Array.from(node.querySelectorAll('a[href]')).slice(0, 100);
    const linkCount = linkNodes.length;
    let externalLinkCount = 0;
    const uniqueHosts = {};
    const originHost = (location && location.hostname) ? location.hostname.replace(/^www\./, '') : '';
    for (let i = 0; i < linkNodes.length; i++) {
      const href = linkNodes[i].getAttribute('href') || '';
      try {
        const url = new URL(href, location.href);
        const host = (url.hostname || '').replace(/^www\./, '');
        if (host) uniqueHosts[host] = true;
        if (originHost && host && host !== originHost) externalLinkCount++;
      } catch (e) { }
    }

    const imageNodes = node.querySelectorAll('img');
    let missingAltCount = 0;
    for (let i = 0; i < imageNodes.length; i++) {
      const alt = (imageNodes[i].getAttribute('alt') || '').trim();
      if (!alt) missingAltCount++;
    }

    const listCount = node.querySelectorAll('ul,ol').length;
    const buttonCount = node.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"], a[role="button"]').length;
    const formCount = node.querySelectorAll('form').length;
    const interactiveCount = countInteractive(node);
    const mediaCount = node.querySelectorAll('video, audio, iframe, picture').length;
    const scripts = node.querySelectorAll('script[type="application/ld+json"]');

    const issues = [];
    if (!words) issues.push('No readable text detected.');
    if (!headingCount) issues.push('No headings found within component.');
    if (imageNodes.length && imageNodes.length === missingAltCount) {
      issues.push('All images missing alt text.');
    } else if (missingAltCount) {
      issues.push(missingAltCount + ' image(s) missing alt text.');
    }
    if (linkCount && !externalLinkCount) issues.push('Links present but none go off-site.');

    return {
      tag,
      label,
      role,
      depth,
      area,
      words,
      textPreview,
      textLength: textRaw.length,
      headingCount,
      headings,
      linkCount,
      externalLinkCount,
      uniqueLinkHosts: Object.keys(uniqueHosts).slice(0, 6),
      imageCount: imageNodes.length,
      missingAltCount,
      listCount,
      buttonCount,
      formCount,
      interactiveCount,
      mediaCount,
      hasStructuredData: scripts.length > 0,
      dataAttributes: listDataAttributes(node),
      issues
    };
  } catch (e) {
    return null;
  }
}
function collectComponentReports() {
  try {
    const selectors = ['header', 'main', 'footer', 'nav', 'aside', 'article', 'section', '[role="main"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]', '[data-component]', '[data-module]', '[data-widget]', '[data-testid]', '[data-qa]'];
    const nodes = [];
    selectors.forEach(sel => {
      qa(sel).forEach(node => {
        if (!node || !node.tagName) return;
        if (node === document.body || node === document.documentElement) return;
        nodes.push(node);
      });
    });
    const reports = [];
    const mark = '__sraComponentSeen';
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node || node[mark]) continue;
      node[mark] = true;
      const report = computeComponentReport(node);
      if (report) reports.push(report);
    }
    for (let j = 0; j < nodes.length; j++) {
      const n = nodes[j];
      if (n && n[mark]) {
        try { delete n[mark]; } catch (e) { }
      }
    }
    return reports;
  } catch (e) {
    return [];
  }
}

function normalizeGtmValue(value, depth) {
  if (depth > 3) return "";
  if (value == null) return "";
  if (typeof value === "string") {
    var trimmed = value.trim();
    if (!trimmed) return "";
    return trimmed.replace(/\s+/g, " ").slice(0, 160);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    var parts = [];
    for (var i = 0; i < value.length; i++) {
      var part = normalizeGtmValue(value[i], depth + 1);
      if (part) parts.push(part);
      if (parts.length >= 3) break;
    }
    return parts.join(", ");
  }
  if (typeof value === "object") {
    try {
      if (typeof value.textContent === "string") {
        var text = value.textContent.trim();
        if (text) return text.replace(/\s+/g, " ").slice(0, 160);
      }
      if (typeof value.innerText === "string") {
        var text2 = value.innerText.trim();
        if (text2) return text2.replace(/\s+/g, " ").slice(0, 160);
      }
    } catch (e) { }
  }
  return "";
}

function pickFirstGtmValue(obj, keys) {
  if (!obj) return "";
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    var val = obj[key];
    var str = normalizeGtmValue(val, 0);
    if (str) return str;
  }
  return "";
}

function detectGtmContainers() {
  try {
    var ids = [];
    var seen = {};
    function add(id) {
      if (!id) return;
      var txt = String(id).trim();
      if (!txt) return;
      if (seen[txt]) return;
      seen[txt] = true;
      ids.push(txt);
    }
    var scripts = document.querySelectorAll('script[src*="googletagmanager.com/gtm"]');
    for (var i = 0; i < scripts.length; i++) {
      var script = scripts[i];
      if (!script || !script.getAttribute) continue;
      var src = script.getAttribute('src') || '';
      if (src) {
        try {
          var url = new URL(src, location.href);
          var paramId = url.searchParams.get('id');
          if (paramId) add(paramId);
          var search = url.search || '';
          if (search) {
            var pairs = search.replace(/^\?/, '').split('&');
            for (var pi = 0; pi < pairs.length; pi++) {
              var pair = pairs[pi];
              if (!pair) continue;
              var eq = pair.indexOf('=');
              if (eq < 0) continue;
              var key = pair.slice(0, eq).toLowerCase();
              if (key !== 'id') continue;
              var value = pair.slice(eq + 1);
              if (value) add(decodeURIComponent(value));
            }
          }
        } catch (e) {
          var match = src.match(/[?&]id=([^&]+)/i);
          if (match && match[1]) add(decodeURIComponent(match[1]));
        }
      }
      var dataId = script.getAttribute('data-gtm-id');
      if (dataId) add(dataId);
    }
    var iframes = document.querySelectorAll('iframe[src*="googletagmanager.com/ns.html"]');
    for (var j = 0; j < iframes.length; j++) {
      var frame = iframes[j];
      if (!frame || !frame.getAttribute) continue;
      var iframeSrc = frame.getAttribute('src') || '';
      if (!iframeSrc) continue;
      var iframeMatch = iframeSrc.match(/[?&]id=([^&]+)/i);
      if (iframeMatch && iframeMatch[1]) add(decodeURIComponent(iframeMatch[1]));
    }
    var gtm = window.google_tag_manager;
    if (gtm && typeof gtm === 'object') {
      for (var key in gtm) {
        if (!Object.prototype.hasOwnProperty.call(gtm, key)) continue;
        if (/^GTM-[A-Z0-9]+$/i.test(key)) add(key);
      }
    }
    return ids;
  } catch (e) {
    return [];
  }
}

function collectDataLayerEvents() {
  try {
    var entries = [];
    var dl = window.dataLayer;
    if (Array.isArray(dl)) {
      entries = dl.slice();
    } else if (dl && typeof dl === 'object') {
      if (Array.isArray(dl.items)) {
        entries = dl.items.slice();
      } else if (typeof dl.length === 'number') {
        for (var li = 0; li < dl.length; li++) {
          entries.push(dl[li]);
        }
      }
    }
    var events = [];
    var seen = {};
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      var eventName = pickFirstGtmValue(entry, ['event', 'eventName', 'event_name']);
      var action = pickFirstGtmValue(entry, ['eventAction', 'event_action', 'action', 'interaction']);
      var category = pickFirstGtmValue(entry, ['eventCategory', 'event_category', 'category', 'group']);
      var label = pickFirstGtmValue(entry, ['eventLabel', 'event_label', 'label', 'text', 'heading', 'linkName', 'link_name']);
      var cta = pickFirstGtmValue(entry, ['cta', 'ctaText', 'cta_text', 'ctaName', 'cta_name', 'linkText', 'link_text', 'buttonText', 'button_text', 'elementText', 'element_text', 'gtm.element', 'gtm.elementTarget']);
      if (!cta && label) cta = label;
      var url = pickFirstGtmValue(entry, ['gtm.elementUrl', 'elementUrl', 'linkUrl', 'link_url', 'destinationUrl', 'destination_url', 'url']);
      var elementId = pickFirstGtmValue(entry, ['gtm.elementId', 'elementId', 'element_id']);
      var elementClasses = pickFirstGtmValue(entry, ['gtm.elementClasses', 'elementClasses', 'element_classes']);
      var value = pickFirstGtmValue(entry, ['eventValue', 'event_value', 'value']);
      var detailParts = [];
      if (url) detailParts.push('URL: ' + url);
      if (elementId) detailParts.push('Element ID: ' + elementId);
      if (elementClasses) detailParts.push('Classes: ' + elementClasses);
      if (value) detailParts.push('Value: ' + value);
      if (Object.prototype.hasOwnProperty.call(entry, 'gtm.triggers')) {
        var trig = normalizeGtmValue(entry['gtm.triggers'], 0);
        if (trig) detailParts.push('Triggers: ' + trig);
      }
      var nonInteraction = entry && Object.prototype.hasOwnProperty.call(entry, 'nonInteraction') ? entry.nonInteraction : null;
      if (nonInteraction === true || nonInteraction === 'true' || nonInteraction === 1 || nonInteraction === '1') {
        detailParts.push('Non-interaction hit');
      }
      if (detailParts.length > 4) detailParts = detailParts.slice(0, 4);
      var detail = detailParts.join(' · ');
      if (detail.length > 200) detail = detail.slice(0, 197) + '…';
      if (!eventName && !cta && !action && !category && !label && !detail) continue;
      var key = [eventName || '', action || '', category || '', cta || '', label || '', detail || ''].join('|');
      if (seen[key]) continue;
      seen[key] = true;
      events.push({
        eventName: eventName || '',
        cta: cta || '',
        action: action || '',
        category: category || '',
        label: label || '',
        detail: detail
      });
    }
    return events;
  } catch (e) {
    return [];
  }
}

function collectGtmSignals() {
  try {
    return {
      containers: detectGtmContainers(),
      events: collectDataLayerEvents()
    };
  } catch (e) {
    return { containers: [], events: [] };
  }
}

function collectWebVitalsOnce() { return new Promise(resolve => { const out = { lcp: null, cls: 0, inp: null }; try { const poLcp = new PerformanceObserver((list) => { const entries = list.getEntries(); const last = entries[entries.length - 1]; if (last) out.lcp = Math.round(last.startTime); }); poLcp.observe({ type: 'largest-contentful-paint', buffered: true }); const poCls = new PerformanceObserver((list) => { for (const e of list.getEntries()) { if (!e.hadRecentInput) out.cls += e.value; } }); poCls.observe({ type: 'layout-shift', buffered: true }); const poInp = new PerformanceObserver((list) => { for (const e of list.getEntries()) { const dur = e.duration; if (!out.inp || dur > out.inp) out.inp = Math.round(dur); } }); poInp.observe({ type: 'event', buffered: true, durationThreshold: 16 }); setTimeout(() => resolve(out), 2500); } catch { resolve(out); } }); }
async function simulateInfiniteScroll() { const beforeCount = document.body.getElementsByTagName('*').length; const targetY = document.documentElement.scrollHeight - window.innerHeight - 5; window.scrollTo(0, Math.max(0, targetY)); const appended = await new Promise(res => { const start = Date.now(); const check = () => { const after = document.body.getElementsByTagName('*').length; if (after - beforeCount >= 20) { res(true); } else if (Date.now() - start > 2000) { res(false); } else { requestAnimationFrame(check); } }; requestAnimationFrame(check); }); return { appendedOnScroll: appended }; }
if (!window.__SRA_CONTENT_ACTIVE__) {
  window.__SRA_CONTENT_ACTIVE__ = true;
  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (msg && msg.type === 'COLLECT_DOM_INFO') {
      (async () => {
        try {
          const [perf, infinite] = await Promise.all([collectWebVitalsOnce(), simulateInfiniteScroll()]);
          const info = {
            url: location.href,
            jsonLdCount: countJsonLd(),
            ogCount: ogCount(),
            twitterCount: twitterCount(),
            metaRobots: metaRobots(),
            titleLength: pageTitle().length,
            metaDescriptionLength: metaDescription().length,
            htmlLang: htmlLang(),
            hreflang: hreflangLinks(),
            titleOk: titleOk(),
            metaDescOk: metaDescOk(),
            h1Count: h1Count(),
            imgWithoutAlt: imgWithoutAlt(),
            langOk: langOk(),
            canonical: canonical(),
            mainWordCount: mainWordCount(),
            resourceHints: resourceHints(),
            images: imageStats(),
            mediaAssets: await collectMediaAssets(),
            gtm: collectGtmSignals(),
            fonts: fontStats(),
            pagination: discoverPagination(),
            components: collectComponentReports(),
            geo: analyzeGeoContent(),
            answer: detectAnswerEngineSignals(),
            perf,
            infinite
          };
          sendResponse(info);
        } catch (e) { sendResponse({}); }
      })();
      return true;
    }
    return undefined;
  });
}