// popup.js — MV3-safe, no optional chaining / nullish coalescing.
// Includes a background PING + retry before requesting COLLECT_NETWORK_INFO.
// Wrapped in an IIFE to keep globals tidy and stabilize line numbers.

(function(){
  "use strict";

  // ---------- DOM refs ----------
  var runBtn         = document.getElementById("run");
  var reportBtn      = document.getElementById("openReport");
  var scoreEl        = document.getElementById("score");
  var gradeEl        = document.getElementById("grade");
  var summaryText    = document.getElementById("summaryText");
  var checklist      = document.getElementById("checklist");
  var suggestionsEl  = document.getElementById("suggestions");
  var catsEl         = document.getElementById("cats");

  // ---------- helpers ----------
  function gradeFromScore(score){ if(score>=90)return"A"; if(score>=80)return"B"; if(score>=70)return"C"; if(score>=60)return"D"; return"F"; }
  function pct(x,max){ var val=Math.max(0,Math.min(Number(x)||0,max)); return Math.round((val/max)*100); }
  function get(obj,path,fallback){
    var cur=obj;
    for (var i=0;i<path.length;i++){
      if (!cur || typeof cur!=="object" || !(path[i] in cur)) return fallback;
      cur=cur[path[i]];
    }
    return cur===undefined?fallback:cur;
  }

  var lastReportKey = null;

  // ---------- service worker wake/diagnostics ----------
  async function pingWorkerOnce(){
    try {
      var res = await chrome.runtime.sendMessage({ type:"PING" });
      return !!(res && res.ok);
    } catch(e){
      return false;
    }
  }
  async function ensureWorkerAwake(){
    // MV3 service workers spin up on demand; try twice
    if (await pingWorkerOnce()) return true;
    await new Promise(function(r){ setTimeout(r,150); });
    return await pingWorkerOnce();
  }

  // ---------- open report ----------
  if (reportBtn){
    reportBtn.addEventListener("click", function(){
      if (!lastReportKey) return;
      var url = chrome.runtime.getURL("report.html?k="+encodeURIComponent(lastReportKey));
      chrome.tabs.create({ url: url });
    });
  }

  // ---------- run audit ----------
  if (runBtn){
    runBtn.addEventListener("click", function(){
      // isolate async to avoid top-level await issues on older Chrome builds
      (async function run(){
        try{
          const tabs = await chrome.tabs.query({ active:true, currentWindow:true });
          const tab  = tabs && tabs[0];

          if (!tab || !tab.id || !/^https?:/i.test(tab.url || "")) {
            summaryText.textContent = "Open a normal web page (http/https) to run the audit.";
            return;
          }

          // Wake background worker first
          var awake = await ensureWorkerAwake();
          if (!awake) {
            summaryText.textContent = "Background didn’t start. Reload the extension, then try again.";
            // keep going; DOM-only audit can still run
          }

          var domInfo = null;
          var netInfo = null;

          try {
            domInfo = await chrome.tabs.sendMessage(tab.id, { type: "COLLECT_DOM_INFO" });
          } catch (e1) {
            // Content script may not be injected or the page forbids it (e.g., Chrome Web Store)
            console.warn("[SRA] DOM info fetch failed:", e1);
          }

          try {
            netInfo = await chrome.runtime.sendMessage({ type: "COLLECT_NETWORK_INFO", url: tab.url });
          } catch (e2) {
            // If you hit this, open chrome://extensions → Inspect views → Service worker and check logs
            console.warn("[SRA] Network info fetch failed:", e2);
          }

          if (!domInfo) domInfo = { url: tab.url };

          var results = computeAudit(domInfo || {}, netInfo || {});
          render(results);

          lastReportKey = "audit-" + Math.random().toString(36).slice(2);
          var saveObj = {}; saveObj[lastReportKey] = results;
          await chrome.storage.local.set(saveObj);

          if (reportBtn) reportBtn.disabled = false;

        } catch(err){
          console.error("[SRA] Fatal error in run():", err);
          summaryText.textContent = "Unexpected error. Open the popup console for details.";
        }
      })();
    });
  }

  // ---------- scoring & report assembly ----------
  function computeAudit(dom, net){
    var CATS = {
      performance: { max: 35, score: 0, items: [] },
      seo:         { max: 25, score: 0, items: [] },
      llm:         { max: 20, score: 0, items: [] },
      a11y:        { max: 10, score: 0, items: [] },
      infinite:    { max: 10, score: 0, items: [] }
    };

    var suggestionsSet = {};
    function addSuggestion(s){ if (s) suggestionsSet[s] = true; }
    function addCat(cat, weight, ok, text, advice){
      var state = ok ? "ok" : (weight >= 6 ? "bad" : "warn");
      CATS[cat].items.push({ state: state, text: text });
      if (ok) CATS[cat].score += weight; else addSuggestion(advice);
    }

    // LLM & SEO signals
    var aiBots = get(net, ["robots","bots"], {});
    addCat("seo", 4, get(net,["sitemap","exists"],false)===true, "Sitemap discoverable", "Expose /sitemap.xml and link it in robots.txt.");
    addCat("llm", 4, get(net,["aiTxt","exists"],false)===true, "ai.txt present", "Publish /ai.txt to declare AI policies.");
    addCat("llm", 3, get(net,["llmsTxt","exists"],false)===true, "llms.txt present", "Include /llms.txt if you maintain it.");

    addCat("llm", 4, get(aiBots,["GPTBot","allowed"],true)!==false, "GPTBot not blocked", "Avoid disallowing GPTBot if you want GPT models to read your site.");
    addCat("llm", 3, get(aiBots,["CCBot","allowed"],true)!==false, "CommonCrawl not blocked", "CommonCrawl feeds many models.");
    addCat("llm", 3, get(aiBots,["ClaudeBot","allowed"],true)!==false, "ClaudeBot not blocked", "Block only if intentional.");
    addCat("llm", 2, get(aiBots,["PerplexityBot","allowed"],true)!==false, "PerplexityBot not blocked", "Block only if intentional.");
    addCat("llm", 3, get(aiBots,["Google-Extended","allowed"],true)!==false, "Google-Extended not blocked", "Block only to limit certain AI uses.");

    var xRobots    = String(get(net,["headers","xRobotsTag"],"")).toLowerCase();
    var metaRobots = String(get(dom,["metaRobots"],"")).toLowerCase();
    var indexAllowed = !(xRobots.indexOf("noindex")>=0 || metaRobots.indexOf("noindex")>=0);
    var aiUseAllowed = !(xRobots.indexOf("noai")>=0 || metaRobots.indexOf("noai")>=0);

    addCat("seo", 4, indexAllowed, "Indexing allowed", "Remove noindex to allow discovery.");
    addCat("llm", 4, aiUseAllowed, "AI use not blocked", "Remove noai if you intend to allow AI use.");

    addCat("seo", 5, (get(dom,["jsonLdCount"],0)||0)>0, "JSON-LD present", "Add schema.org JSON-LD (WebSite/Article/FAQ/etc).");
    addCat("seo", 3, !!get(dom,["canonical"],""), "Canonical present", "Add <link rel=\"canonical\">.");
    addCat("seo", 3, !!get(dom,["titleOk"],false), "Title length OK (10–70)", "Keep concise, descriptive titles.");
    addCat("seo", 3, !!get(dom,["metaDescOk"],false), "Meta description OK (50–160)", "Add a helpful summary.");
    addCat("seo", 2, (get(dom,["ogCount"],0)||0)>0, "OpenGraph present", "Add og:* tags for rich previews.");
    addCat("seo", 2, (get(dom,["twitterCount"],0)||0)>0, "Twitter Card present", "Add twitter:* tags.");

    // A11y
    addCat("a11y", 3, get(dom,["h1Count"],0)===1, "Single <h1> present", "Use exactly one H1.");
    addCat("a11y", 3, (get(dom,["imgWithoutAlt"],0)||0)===0, "Images have alt", "Add alt attributes.");
    addCat("a11y", 2, !!get(dom,["langOk"],false), "html[lang] set", "Set <html lang=\"...\">.");
    addCat("a11y", 2, (get(dom,["mainWordCount"],0)||0)>=300, "Substantive text (>=300 words)", "Add more helpful copy.");

    // Performance (heuristics)
    var lcp = get(dom,["perf","lcp"],null);
    var cls = get(dom,["perf","cls"],null);
    var inp = get(dom,["perf","inp"],null);
    var lcpOk = (lcp==null) ? true : (lcp<=2500);
    var clsOk = (typeof cls==="number") ? (cls<=0.1) : true;
    var inpOk = (inp==null) ? true : (inp<=200);

    addCat("performance", 6, !!lcpOk, "LCP <= 2.5s (observed: "+(lcp==null?"--":lcp)+"ms)", "Optimize LCP element (hero text/image, critical CSS).");
    addCat("performance", 4, !!clsOk, "CLS <= 0.1 (observed: "+(cls==null?"--":cls)+")", "Reserve space for media, use font-display.");
    addCat("performance", 4, !!inpOk, "INP <= 200ms (observed: "+(inp==null?"--":inp)+"ms)", "Trim JS, avoid long tasks, defer non-critical work.");

    var enc = String(get(net,["root","headers","content-encoding"],"")).toLowerCase();
    var compressed = enc.indexOf("br")>=0 || enc.indexOf("gzip")>=0 || enc.indexOf("zstd")>=0;
    var cacheOk = /max-age=\d{3,}/i.test(String(get(net,["root","headers","cache-control"],"")));

    addCat("performance", 4, !!compressed, "Compression enabled (gzip/br)", "Enable Brotli/gzip on HTML and static assets.");
    addCat("performance", 4, !!cacheOk, "Caching headers present", "Set Cache-Control/ETag on static assets.");
    addCat("performance", 3, (get(dom,["resourceHints","preconnect"],0)||0)>0, "Preconnect present", "Add <link rel=\"preconnect\"> to critical origins.");
    addCat("performance", 3, (get(dom,["resourceHints","preload"],0)||0)>0, "Preload present", "Preload hero font/image/CSS.");
    addCat("performance", 3, (get(dom,["images","modernPct"],0)||0)>=70, "Modern images >=70% ("+Math.round(get(dom,["images","modernPct"],0)||0)+"%)", "Prefer AVIF/WebP for large images.");
    addCat("performance", 3, (get(dom,["images","lazyPct"],0)||0)>=70, "Lazy-loaded images >=70% ("+Math.round(get(dom,["images","lazyPct"],0)||0)+"%)", "Use loading=\"lazy\" below the fold.");
    addCat("performance", 2, !!get(dom,["fonts","haveDisplay"],false), "Fonts use font-display", "Use font-display: swap/optional.");

    // Infinite scroll / crawlable pagination
    var hasPaginationLinks  = ((get(dom,["pagination","links"],[])||[]).length)>0;
    var infiniteObserved    = !!get(dom,["infinite","appendedOnScroll"],false);
    var pageFetchOK         = !!get(net,["paginationFetch","ok"],false);
    var paginationVisible   = !!get(dom,["pagination","visible"],false);
    var relNextPrevFound    = !!get(dom,["pagination","relNextPrev"],false);

    var infinitePatternOK =
      (infiniteObserved && hasPaginationLinks && pageFetchOK) ||
      (!infiniteObserved && hasPaginationLinks && pageFetchOK);

    addCat("infinite", 6, infinitePatternOK, "Crawlable pagination present (with or without infinite UI)", "Ensure page 2/3 links exist and return content server-side.");
    addCat("infinite", 2, (paginationVisible || relNextPrevFound), paginationVisible ? "Pagination visible to users" : "rel=\"next/prev\" present", "Prefer visible anchor links; rel is only a hint.");
    addCat("infinite", 2, true, infiniteObserved ? "Infinite scroll detected" : "Traditional pagination", infiniteObserved ? null : "If you want infinite UX, progressively append without hiding crawlable links.");

    // Overall
    var overallMax=0, got=0;
    Object.keys(CATS).forEach(function(k){ overallMax+=CATS[k].max; got+=CATS[k].score; });
    var overallPct = Math.round((got/overallMax)*100);

    // Key checks (top 12)
    var keyChecks = [];
    Object.keys(CATS).forEach(function(id){
      CATS[id].items.forEach(function(i){ keyChecks.push({ cat:id, state:i.state, text:i.text }); });
    });
    keyChecks = keyChecks.slice(0,12);

    var suggestions = Object.keys(suggestionsSet);

    return {
      meta: { url: get(dom,["url"],"") || (get(net,["url"],"") || "") },
      overall: { score: overallPct, grade: gradeFromScore(overallPct) },
      categories: {
        performance: { score: pct(CATS.performance.score,CATS.performance.max), items: CATS.performance.items },
        seo:         { score: pct(CATS.seo.score,CATS.seo.max), items: CATS.seo.items },
        llm:         { score: pct(CATS.llm.score,CATS.llm.max), items: CATS.llm.items },
        a11y:        { score: pct(CATS.a11y.score,CATS.a11y.max), items: CATS.a11y.items },
        infinite:    { score: pct(CATS.infinite.score,CATS.infinite.max), items: CATS.infinite.items }
      },
      keyChecks: keyChecks,
      suggestions: suggestions,
      dom: dom,
      net: net
    };
  }

  // ---------- render ----------
  function render(result){
    scoreEl.textContent = result.overall.score;
    gradeEl.textContent = result.overall.grade;

    summaryText.textContent =
      result.overall.score >= 90 ? "Excellent overall readiness." :
      result.overall.score >= 75 ? "Good foundation—fix the top warnings." :
                                   "Multiple issues detected. Fix top suggestions first.";

    catsEl.innerHTML = "";
    var names = Object.keys(result.categories);
    for (var i=0;i<names.length;i++){
      var name = names[i];
      var cat = result.categories[name];
      var li = document.createElement("li");
      var title = name[0].toUpperCase() + name.slice(1);
      li.textContent = title + ": " + cat.score + "/100";
      catsEl.appendChild(li);
    }

    checklist.innerHTML = "";
    var kc = result.keyChecks || [];
    for (var j=0;j<kc.length;j++){
      var c = kc[j];
      var li2 = document.createElement("li");
      li2.textContent = "[" + c.cat + "] " + c.text;
      li2.className = c.state;
      checklist.appendChild(li2);
    }

    suggestionsEl.innerHTML = "";
    var sgs = result.suggestions || [];
    for (var k=0;k<sgs.length;k++){
      var s = sgs[k];
      var li3 = document.createElement("li");
      li3.textContent = s;
      suggestionsEl.appendChild(li3);
    }
  }

  console.debug("[SRA] popup.js loaded");

})();
