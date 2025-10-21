function q(sel){return document.querySelector(sel)}
function qa(sel){return Array.from(document.querySelectorAll(sel))}
function getMeta(name){return q(`meta[name="${name}"]`)?.getAttribute('content')||''}
function getHeader(name){return q(`meta[http-equiv="${name}"]`)?.getAttribute('content')||''}
function metaRobots(){ const v = (getMeta('robots') || getHeader('X-Robots-Tag') || '').toLowerCase(); return v; }
function countJsonLd(){ return qa('script[type="application/ld+json"]').length }
function ogCount(){ return qa('meta[property^="og:"]').length }
function twitterCount(){ return qa('meta[name^="twitter:"]').length }
function titleOk(){ const t = (document.title || '').trim(); return t.length >= 10 && t.length <= 70; }
function metaDescOk(){ const d = getMeta('description') || ''; const len = d.trim().length; return len >= 50 && len <= 160; }
function h1Count(){ return qa('h1').length }
function imgWithoutAlt(){ return qa('img').filter(img => !(img.getAttribute('alt')||'').trim()).length }
function langOk(){ return !!(document.documentElement.getAttribute('lang')||'').trim() }
function canonical(){ return q('link[rel="canonical"]')?.href || '' }
function mainWordCount(){ const clone = document.body.cloneNode(true); clone.querySelectorAll('script,style,nav,footer,header,form,aside').forEach(n=>n.remove()); const text=(clone.innerText||'').replace(/\s+/g,' ').trim(); return text.split(' ').filter(Boolean).length; }
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
          perf,
          infinite
        };
        sendResponse(info);
      } catch (e) { sendResponse({}); }
    })();
    return true;
  }
});