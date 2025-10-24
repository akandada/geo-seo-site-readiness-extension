function q(sel){return document.querySelector(sel)}
function qa(sel){return Array.from(document.querySelectorAll(sel))}
function getMeta(name){return q(`meta[name="${name}"]`)?.getAttribute('content')||''}
function getHeader(name){return q(`meta[http-equiv="${name}"]`)?.getAttribute('content')||''}
function metaRobots(){ const v = (getMeta('robots') || getHeader('X-Robots-Tag') || '').toLowerCase(); return v; }
function pageTitle(){ return (document.title || '').trim(); }
function metaDescription(){ return (getMeta('description') || '').trim(); }
function countJsonLd(){ return qa('script[type="application/ld+json"]').length }
function ogCount(){ return qa('meta[property^="og:"]').length }
function twitterCount(){ return qa('meta[name^="twitter:"]').length }
function titleOk(){ const t = (document.title || '').trim(); return t.length >= 10 && t.length <= 70; }
function metaDescOk(){ const d = getMeta('description') || ''; const len = d.trim().length; return len >= 50 && len <= 160; }
function h1Count(){ return qa('h1').length }
function imgWithoutAlt(){ return qa('img').filter(img => !(img.getAttribute('alt')||'').trim()).length }
function langOk(){ return !!(document.documentElement.getAttribute('lang')||'').trim() }
function htmlLang(){ return (document.documentElement.getAttribute('lang')||'').trim(); }
function canonical(){ return q('link[rel="canonical"]')?.href || '' }
function mainWordCount(){ const clone = document.body.cloneNode(true); clone.querySelectorAll('script,style,nav,footer,header,form,aside').forEach(n=>n.remove()); const text=(clone.innerText||'').replace(/\s+/g,' ').trim(); return text.split(' ').filter(Boolean).length; }
const GEO_STOPWORDS = new Set(['the','be','to','of','and','a','in','that','have','i','it','for','not','on','with','he','as','you','do','at','this','but','his','by','from','they','we','say','her','she','or','an','will','my','one','all','would','there','their','is','are','was','were','had','has','were','your','can','our','more','about']);
function countSyllables(word){
  try {
    var w = (word||'').toLowerCase().replace(/[^a-z\u00c0-\u017f]/g,'');
    if (!w) return 0;
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    w = w.replace(/^y/, '');
    var matches = w.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  } catch(e){ return 0; }
}
function analyzeGeoContent(){
  try {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,svg,canvas,nav,footer,header,form,aside').forEach(n=>n.remove());
    const text = (clone.innerText||'').replace(/\s+/g,' ').trim();
    const wordsOriginal = (text.match(/[A-Za-z\u00C0-\u017F']+/g) || []);
    const words = wordsOriginal.map(w=>w.toLowerCase().replace(/'/g,''));
    const wordsFiltered = words.filter(Boolean);
    const totalWords = wordsFiltered.length;
    const uniqueWordCount = Array.from(new Set(wordsFiltered)).length;
    const uniqueWordRatio = totalWords ? uniqueWordCount/totalWords : 0;

    const freq = {};
    var topWord = '';
    var topCount = 0;
    for (var i=0;i<wordsFiltered.length;i++){
      var token = wordsFiltered[i];
      if (!token || GEO_STOPWORDS.has(token)) continue;
      freq[token] = (freq[token]||0)+1;
      if (freq[token] > topCount){
        topCount = freq[token];
        topWord = token;
      }
    }
    const topWordRatio = totalWords ? topCount/totalWords : 0;

    const sentences = text.split(/[.!?]+/).map(s=>s.trim()).filter(Boolean);
    const sentenceCount = sentences.length;
    var syllableSum = 0;
    for (var j=0;j<wordsOriginal.length;j++) syllableSum += countSyllables(wordsOriginal[j]);
    const avgSentenceLength = sentenceCount ? (totalWords / sentenceCount) : 0;
    const syllablesPerWord = totalWords ? (syllableSum / totalWords) : 0;
    const flesch = (sentenceCount && totalWords) ? (206.835 - 1.015 * avgSentenceLength - 84.6 * syllablesPerWord) : 0;

    const capitalizedSentences = sentences.filter(function(s){ return /^[A-Z0-9\u00C0-\u017F]/.test(s); }).length;
    const capitalizedRatio = sentenceCount ? capitalizedSentences / sentenceCount : 0;

    const longWords = wordsOriginal.filter(function(w){ return w.length >= 9; }).length;
    const technicalTerms = wordsOriginal.filter(function(w){ return /(?:ization|isation|ology|metric|engine|network|algorithm|platform|compliance|optimization)$/i.test(w) || /^[A-Z]{3,}$/.test(w); }).length;
    const technicalTermRatio = totalWords ? (technicalTerms + longWords*0.5) / totalWords : 0;

    const doc = document;
    const headings = doc.querySelectorAll('h2, h3').length;
    const listItems = doc.querySelectorAll('ul li, ol li').length;
    const hasTable = !!doc.querySelector('table');
    const hasEmphasis = !!doc.querySelector('strong, b, em, mark');

    const anchors = Array.from(doc.querySelectorAll('a[href]'));
    const originHost = (location && location.hostname) ? location.hostname.replace(/^www\./,'') : '';
    var externalLinks = [];
    var authorityLinks = [];
    anchors.forEach(function(a){
      var href = a.getAttribute('href')||'';
      try {
        var u = new URL(href, location.href);
        var host = (u.hostname||'').replace(/^www\./,'');
        var isExternal = !!originHost && host && host !== originHost;
        if (isExternal) {
          externalLinks.push(host);
          if (/\.(gov|edu)$/i.test(host) || /(journal|research|study|report|whitepaper)/i.test(a.textContent||'')) {
            authorityLinks.push(host);
          }
        }
      } catch(e) { /* ignore */ }
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
        richFormatting: (headings>=2) || (listItems>4) || hasTable || hasEmphasis
      },
      externalLinkCount: externalLinks.length,
      citationAuthorityCount: authorityLinks.length,
      citationAuthoritySamples: authorityLinks.slice(0,3),
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
function resourceHints(){ return { preconnect: qa('link[rel=\"preconnect\"]').length, preload: qa('link[rel=\"preload\"]').length, dnsPrefetch: qa('link[rel=\"dns-prefetch\"]').length }; }
function imageStats(){ const imgs = qa('img'); const total = imgs.length || 1; const modern = imgs.filter(i => (i.src||'').match(/\.(avif|webp)(\?|$)/i)).length; const lazy = imgs.filter(i => (i.getAttribute('loading')||'').toLowerCase()==='lazy').length; return { count: imgs.length, modernPct: (modern/total)*100, lazyPct: (lazy/total)*100 }; }
function fontStats(){ const styles = qa('style, link[rel=\"stylesheet\"]'); let haveDisplay=false; styles.forEach(s=>{ const txt = s.tagName==='STYLE' ? s.textContent : ''; if (txt && /font-display\\s*:\\s*(swap|optional)/i.test(txt)) haveDisplay = true; }); return { haveDisplay }; }

function normalizeMediaUrl(url){
  if (!url) return '';
  try {
    var absolute = new URL(url, location.href);
    absolute.hash = '';
    return absolute.href;
  } catch (e) {
    return url;
  }
}
function estimateDataUriSize(uri){
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
function collectMediaAssets(){
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
function discoverPagination(){ const candidates = qa('a[href]'); const links = candidates.map(a => a.getAttribute('href')).filter(Boolean).map(h=>h.trim()).filter(h => /[?&](page|p|pg|pagination)=\d+/i.test(h) || /\/page\/\d+\/?$/i.test(h) || /[?&]offset=\d+/i.test(h) || /\/p\/\d+\/?$/i.test(h)).slice(0, 10); const navVisible = !!q('nav[aria-label*=\"pagination\" i], ul.pagination, .pagination, a[rel=\"next\"], a[rel=\"prev\"]'); const relNextPrev = !!q('link[rel=\"next\"], link[rel=\"prev\"]'); return { visible: navVisible, relNextPrev, links: Array.from(new Set(links)) }; }
function describeNodeLabel(node){
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
function countInteractive(node){
  const interactiveSel = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], [role="menuitem"]';
  return node.querySelectorAll(interactiveSel).length;
}
function extractHeadings(node){
  const headings = Array.from(node.querySelectorAll('h1,h2,h3,h4,h5,h6')).slice(0, 5);
  return headings.map(h => {
    const text = (h.innerText || '').replace(/\s+/g, ' ').trim();
    return text.slice(0, 80) + (text.length > 80 ? '…' : '');
  });
}
function listDataAttributes(node){
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
function computeComponentReport(node){
  try {
    const label = describeNodeLabel(node);
    const tag = (node.tagName || '').toLowerCase();
    const role = (node.getAttribute('role') || '').trim();
    const depth = (function(){
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
    const originHost = (location && location.hostname) ? location.hostname.replace(/^www\./,'') : '';
    for (let i = 0; i < linkNodes.length; i++) {
      const href = linkNodes[i].getAttribute('href') || '';
      try {
        const url = new URL(href, location.href);
        const host = (url.hostname || '').replace(/^www\./,'');
        if (host) uniqueHosts[host] = true;
        if (originHost && host && host !== originHost) externalLinkCount++;
      } catch (e) {}
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
function collectComponentReports(){
  try {
    const selectors = ['header','main','footer','nav','aside','article','section','[role="main"]','[role="banner"]','[role="contentinfo"]','[role="complementary"]','[data-component]','[data-module]','[data-widget]','[data-testid]','[data-qa]'];
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
        try { delete n[mark]; } catch (e) {}
      }
    }
    return reports;
  } catch (e) {
    return [];
  }
}
function collectWebVitalsOnce(){ return new Promise(resolve => { const out = { lcp: null, cls: 0, inp: null }; try { const poLcp = new PerformanceObserver((list)=>{ const entries=list.getEntries(); const last=entries[entries.length-1]; if (last) out.lcp = Math.round(last.startTime); }); poLcp.observe({ type: 'largest-contentful-paint', buffered: true }); const poCls = new PerformanceObserver((list)=>{ for (const e of list.getEntries()) { if (!e.hadRecentInput) out.cls += e.value; } }); poCls.observe({ type: 'layout-shift', buffered: true }); const poInp = new PerformanceObserver((list)=>{ for (const e of list.getEntries()) { const dur = e.duration; if (!out.inp || dur > out.inp) out.inp = Math.round(dur); } }); poInp.observe({ type: 'event', buffered: true, durationThreshold: 16 }); setTimeout(()=>resolve(out), 2500); } catch { resolve(out); } }); }
async function simulateInfiniteScroll(){ const beforeCount = document.body.getElementsByTagName('*').length; const targetY = document.documentElement.scrollHeight - window.innerHeight - 5; window.scrollTo(0, Math.max(0, targetY)); const appended = await new Promise(res => { const start = Date.now(); const check = () => { const after = document.body.getElementsByTagName('*').length; if (after - beforeCount >= 20) { res(true); } else if (Date.now() - start > 2000) { res(false); } else { requestAnimationFrame(check); } }; requestAnimationFrame(check); }); return { appendedOnScroll: appended }; }
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'COLLECT_DOM_INFO') {
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
          titleOk: titleOk(),
          metaDescOk: metaDescOk(),
          h1Count: h1Count(),
          imgWithoutAlt: imgWithoutAlt(),
          langOk: langOk(),
          canonical: canonical(),
          mainWordCount: mainWordCount(),
          resourceHints: resourceHints(),
          images: imageStats(),
          mediaAssets: collectMediaAssets(),
          fonts: fontStats(),
          pagination: discoverPagination(),
          components: collectComponentReports(),
          geo: analyzeGeoContent(),
          perf,
          infinite
        };
        sendResponse(info);
      } catch (e) { sendResponse({}); }
    })();
    return true;
  }
});