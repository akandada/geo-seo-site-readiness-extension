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
function discoverPagination(){ const candidates = qa('a[href]'); const links = candidates.map(a => a.getAttribute('href')).filter(Boolean).map(h=>h.trim()).filter(h => /[?&](page|p|pg|pagination)=\d+/i.test(h) || /\/page\/\d+\/?$/i.test(h) || /[?&]offset=\d+/i.test(h) || /\/p\/\d+\/?$/i.test(h)).slice(0, 10); const navVisible = !!q('nav[aria-label*=\"pagination\" i], ul.pagination, .pagination, a[rel=\"next\"], a[rel=\"prev\"]'); const relNextPrev = !!q('link[rel=\"next\"], link[rel=\"prev\"]'); return { visible: navVisible, relNextPrev, links: Array.from(new Set(links)) }; }
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
          fonts: fontStats(),
          pagination: discoverPagination(),
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