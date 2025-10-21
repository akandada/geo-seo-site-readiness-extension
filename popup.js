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
  var progressEl     = document.getElementById("progress");
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

  function resetProgress(){ if(progressEl) progressEl.innerHTML=""; }
  function pushProgress(text, state){
    if(!progressEl) return;
    var div = document.createElement("div");
    div.className = "progress-item" + (state ? " " + state : "");
    div.textContent = text;
    progressEl.appendChild(div);
  }

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
          runBtn.disabled = true;
          resetProgress();
          pushProgress("Starting audit…");
          if (summaryText) summaryText.textContent = "Running audit…";

          const tabs = await chrome.tabs.query({ active:true, currentWindow:true });
          const tab  = tabs && tabs[0];

          if (!tab || !tab.id || !/^https?:/i.test(tab.url || "")) {
            summaryText.textContent = "Open a normal web page (http/https) to run the audit.";
            pushProgress("Active tab is not a standard web page.", "warn");
            return;
          }

          // Wake background worker first
          pushProgress("Waking background worker…");
          var awake = await ensureWorkerAwake();
          pushProgress(awake ? "Background worker awake." : "Background worker not responding; continuing with limited checks.", awake ? "done" : "warn");
          if (!awake) {
            summaryText.textContent = "Background didn’t start. Reload the extension, then try again.";
            // keep going; DOM-only audit can still run
          }

          var domInfo = null;
          var netInfo = null;

          try {
            pushProgress("Collecting DOM data…");
            domInfo = await chrome.tabs.sendMessage(tab.id, { type: "COLLECT_DOM_INFO" });
            pushProgress(domInfo ? "DOM data collected." : "DOM data unavailable (fallback).", domInfo ? "done" : "warn");
          } catch (e1) {
            // Content script may not be injected or the page forbids it (e.g., Chrome Web Store)
            console.warn("[SRA] DOM info fetch failed:", e1);
            pushProgress("DOM data request failed.", "warn");
          }

          try {
            pushProgress("Scanning network endpoints (robots.txt, ai.txt, llms.txt, sitemap)…");
            netInfo = await chrome.runtime.sendMessage({ type: "COLLECT_NETWORK_INFO", url: tab.url });
            pushProgress(netInfo ? "Network scan complete." : "Network scan unavailable (fallback).", netInfo ? "done" : "warn");
          } catch (e2) {
            // If you hit this, open chrome://extensions → Inspect views → Service worker and check logs
            console.warn("[SRA] Network info fetch failed:", e2);
            pushProgress("Network scan failed.", "warn");
          }

          if (!domInfo) domInfo = { url: tab.url };

          pushProgress("Calculating readiness scores…");
          var results = computeAudit(domInfo || {}, netInfo || {});
          render(results);
          pushProgress("Audit complete.", "done");

          lastReportKey = "audit-" + Math.random().toString(36).slice(2);
          var saveObj = {}; saveObj[lastReportKey] = results;
          await chrome.storage.local.set(saveObj);

          if (reportBtn) reportBtn.disabled = false;

        } catch(err){
          console.error("[SRA] Fatal error in run():", err);
          summaryText.textContent = "Unexpected error. Open the popup console for details.";
          pushProgress("Audit failed to complete.", "error");
        } finally {
          if (runBtn) runBtn.disabled = false;
          if (reportBtn && lastReportKey) reportBtn.disabled = false;
        }
      })();
    });
  }

  // ---------- scoring & report assembly ----------
  function computeAudit(dom, net){
    var CATS = {
      performance: { max: 35, score: 0, items: [] },
      seo:         { max: 25, score: 0, items: [] },
      geo:         { max: 20, score: 0, items: [] },
      llm:         { max: 20, score: 0, items: [] },
      a11y:        { max: 10, score: 0, items: [] },
      infinite:    { max: 10, score: 0, items: [] }
    };

    var suggestionsSet = {};
    function addSuggestion(s){ if (s) suggestionsSet[s] = true; }
    function addCat(cat, weight, ok, text, advice, detail){
      var state = ok ? "ok" : (weight >= 6 ? "bad" : "warn");
      CATS[cat].items.push({
        state: state,
        text: text,
        detail: detail || "",
        fix: (!ok && advice) ? advice : ""
      });
      if (ok) {
        CATS[cat].score += weight;
      } else if (advice) {
        addSuggestion(advice);
      }
    }

    // LLM, GEO & SEO signals
    var aiBots = get(net, ["robots","bots"], {});
    var sitemapExists = get(net,["sitemap","exists"],false)===true;
    var sitemapDetail = sitemapExists ?
      "robots.txt references a sitemap or /sitemap.xml responded." :
      "No sitemap reference found in robots.txt and /sitemap.xml was unreachable.";
    addCat("seo", 4, sitemapExists, "Sitemap discoverable", "Expose /sitemap.xml and link it in robots.txt.", sitemapDetail);

    var aiTxtOk   = get(net,["aiTxt","exists"],false)===true;
    var aiTxtStatus = get(net,["aiTxt","status"],0);
    var aiTxtUrl    = get(net,["aiTxt","url"],"");
    var aiTxtCt     = get(net,["aiTxt","ct"],"");
    var aiTxtDetail = aiTxtOk ?
      "Detected plain-text ai.txt at " + (aiTxtUrl || "/ai.txt") + (aiTxtCt ? " (" + aiTxtCt + ")" : "") + "." :
      "Response status " + aiTxtStatus + " or non-text content prevented detecting /ai.txt.";
    addCat("llm", 4, aiTxtOk, aiTxtOk ? "ai.txt present" : "ai.txt missing", "Publish /ai.txt to declare AI policies.", aiTxtDetail);

    var llmsTxtOk = get(net,["llmsTxt","exists"],false)===true;
    var llmsStatus = get(net,["llmsTxt","status"],0);
    var llmsUrl    = get(net,["llmsTxt","url"],"");
    var llmsCt     = get(net,["llmsTxt","ct"],"");
    var llmsDetail = llmsTxtOk ?
      "Detected plain-text llms.txt at " + (llmsUrl || "/llms.txt") + (llmsCt ? " (" + llmsCt + ")" : "") + "." :
      "Response status " + llmsStatus + " or non-text content prevented detecting /llms.txt.";
    addCat("llm", 3, llmsTxtOk, llmsTxtOk ? "llms.txt present" : "llms.txt missing", "Include /llms.txt if you maintain it.", llmsDetail);

    function botDetail(botName, allowed){
      return allowed ?
        botName + " is not disallowed in robots.txt." :
        botName + " is disallowed via robots.txt directives.";
    }

    var gptAllowed = get(aiBots,["GPTBot","allowed"],true)!==false;
    addCat("llm", 4, gptAllowed, "GPTBot not blocked", "Avoid disallowing GPTBot if you want GPT models to read your site.", botDetail("GPTBot", gptAllowed));

    var ccAllowed = get(aiBots,["CCBot","allowed"],true)!==false;
    addCat("llm", 3, ccAllowed, "CommonCrawl not blocked", "CommonCrawl feeds many models.", botDetail("CCBot", ccAllowed));

    var claudeAllowed = get(aiBots,["ClaudeBot","allowed"],true)!==false;
    addCat("llm", 3, claudeAllowed, "ClaudeBot not blocked", "Block only if intentional.", botDetail("ClaudeBot", claudeAllowed));

    var perplexityAllowed = get(aiBots,["PerplexityBot","allowed"],true)!==false;
    addCat("llm", 2, perplexityAllowed, "PerplexityBot not blocked", "Block only if intentional.", botDetail("PerplexityBot", perplexityAllowed));

    var googleExtAllowed = get(aiBots,["Google-Extended","allowed"],true)!==false;
    addCat("llm", 3, googleExtAllowed, "Google-Extended not blocked", "Block only to limit certain AI uses.", botDetail("Google-Extended", googleExtAllowed));

    var xRobots    = String(get(net,["headers","xRobotsTag"],"")).toLowerCase();
    var metaRobots = String(get(dom,["metaRobots"],"")).toLowerCase();
    var indexAllowed = !(xRobots.indexOf("noindex")>=0 || metaRobots.indexOf("noindex")>=0);
    var aiUseAllowed = !(xRobots.indexOf("noai")>=0 || metaRobots.indexOf("noai")>=0);

    function directiveDetail(ok, directive, sourceHeader, sourceMeta){
      if (ok) return "No " + directive + " directive detected in meta or headers.";
      var sources = [];
      if (sourceHeader) sources.push("X-Robots-Tag header");
      if (sourceMeta) sources.push("<meta name=\"robots\"> tag");
      if (!sources.length) return directive + " directive detected.";
      return directive + " directive found in " + sources.join(" and ") + ".";
    }

    var indexDetail = directiveDetail(indexAllowed, "noindex", xRobots.indexOf("noindex")>=0, metaRobots.indexOf("noindex")>=0);
    addCat("seo", 4, indexAllowed, "Indexing allowed", "Remove noindex to allow discovery.", indexDetail);

    var aiDetail = directiveDetail(aiUseAllowed, "noai", xRobots.indexOf("noai")>=0, metaRobots.indexOf("noai")>=0);
    addCat("llm", 4, aiUseAllowed, "AI use not blocked", "Remove noai if you intend to allow AI use.", aiDetail);

    var jsonLdCount = get(dom,["jsonLdCount"],0)||0;
    addCat("seo", 5, jsonLdCount>0, "JSON-LD present", "Add schema.org JSON-LD (WebSite/Article/FAQ/etc).", jsonLdCount>0 ? jsonLdCount + " JSON-LD script tag(s) found." : "No JSON-LD script tags detected.");

    // GEO content optimization heuristics
    var geo = get(dom,["geo"],{});
    var geoWordTotal = Number(get(geo,["totalWords"],0)||0);
    var uniqueRatio = Number(get(geo,["uniqueWordRatio"],0)||0);
    var uniqueCount = Number(get(geo,["uniqueWordCount"],0)||0);
    var uniqueDetail = geoWordTotal ? (Math.round(uniqueRatio*1000)/10) + "% unique of " + geoWordTotal + " words." : "Not enough content to evaluate.";
    var uniqueOk = geoWordTotal < 80 ? uniqueCount>0 : uniqueRatio >= 0.45;
    addCat("geo", 2, uniqueOk, "Healthy unique word ratio", "Expand vocabulary variety to avoid repetition.", uniqueDetail);

    var topWord = get(geo,["topWord","word"],"");
    var topCount = Number(get(geo,["topWord","count"],0)||0);
    var topRatio = Number(get(geo,["topWord","ratio"],0)||0);
    var stuffingDetail = topCount ? "Top term '" + topWord + "' appears " + topCount + "× (" + Math.round(topRatio*1000)/10 + "%)." : "No dominant keyword detected.";
    var stuffingOk = geoWordTotal < 120 ? true : topRatio <= 0.08;
    addCat("geo", 2, stuffingOk, stuffingOk ? "No keyword stuffing detected" : "Keyword concentration high", "Reduce repeated head terms; vary phrasing.", stuffingDetail);

    var readability = get(geo,["readability"],{});
    var flesch = Number(readability.flesch||0);
    var sentCount = Number(readability.sentences||0);
    var easyDetail = sentCount ? "Flesch reading ease ≈ " + Math.round(flesch) + " across " + sentCount + " sentences." : "Not enough sentences to measure.";
    var easyOk = sentCount < 2 ? geoWordTotal > 0 : flesch >= 50;
    addCat("geo", 2, easyOk, easyOk ? "Readable for general audiences" : "Reading level is dense", "Shorten sentences and use simpler wording.", easyDetail);

    var authorityCount = Number(get(geo,["citationAuthorityCount"],0)||0);
    var authoritySamples = get(geo,["citationAuthoritySamples"],[])||[];
    var authorityDetail = authorityCount ? authorityCount + " authoritative citation(s) like " + authoritySamples.join(", ") + "." : "No authoritative citations detected.";
    var authorityOk = authorityCount >= 2 || geoWordTotal < 150;
    addCat("geo", 2, authorityOk, authorityOk ? "Authoritative sources cited" : "Add authoritative references", "Link to government, academic, or research sources.", authorityDetail);

    var techRatio = Number(get(geo,["technicalTermRatio"],0)||0);
    var techDetail = geoWordTotal ? Math.round(techRatio*1000)/10 + "% of terms appear technical/jargon-based." : "Not enough content to evaluate.";
    var techOk = geoWordTotal < 150 ? true : techRatio >= 0.08;
    addCat("geo", 2, techOk, techOk ? "Technical depth present" : "Add precise technical terminology", "Incorporate industry-specific language where appropriate.", techDetail);

    var fluencyRatio = Number(get(geo,["fluency","capitalizedRatio"],0)||0);
    var fluencyDetail = sentCount ? Math.round(fluencyRatio*100) + "% of sentences start with proper capitalization." : "Not enough sentences to measure.";
    var fluencyOk = sentCount < 3 ? geoWordTotal > 0 : fluencyRatio >= 0.75;
    addCat("geo", 2, fluencyOk, fluencyOk ? "Sentences flow naturally" : "Improve sentence fluency", "Revise sentence starts and transitions for smoother flow.", fluencyDetail);

    var structure = get(geo,["structure"],{});
    var structureOk = !!structure && (structure.richFormatting || structure.headings >= 2 || (structure.headings >= 1 && structure.listItems >= 3));
    var structureDetail = structure ? "Headings: " + (structure.headings||0) + ", list items: " + (structure.listItems||0) + (structure.hasEmphasis ? ", emphasis detected" : "") : "No structure info.";
    addCat("geo", 2, structureOk, structureOk ? "Content is well-structured" : "Add scannable structure", "Use descriptive headings, bullets, and emphasis for clarity.", structureDetail);

    var externalLinks = Number(get(geo,["externalLinkCount"],0)||0);
    var citeDetail = externalLinks ? externalLinks + " outbound reference link(s) detected." : "No outbound citations found.";
    var citeOk = externalLinks >= 3 || authorityCount >= 1 || geoWordTotal < 120;
    addCat("geo", 2, citeOk, citeOk ? "References cited" : "Add outbound citations", "Link to supporting articles, datasets, or studies.", citeDetail);

    var quoteCount = Number(get(geo,["quoteCount"],0)||0);
    var quoteDetail = quoteCount ? quoteCount + " quotation or blockquote instance(s)." : "No quotations detected.";
    var quoteOk = quoteCount >= 1 || geoWordTotal < 150;
    addCat("geo", 2, quoteOk, quoteOk ? "Quotes enrich the narrative" : "Add expert quotations", "Include quotes from subject-matter experts or stakeholders.", quoteDetail);

    var statsCount = Number(get(geo,["statsCount"],0)||0);
    var statsDetail = statsCount ? statsCount + " statistical reference(s) detected." : "No statistics detected.";
    var statsOk = statsCount >= 1 || geoWordTotal < 150;
    addCat("geo", 2, statsOk, statsOk ? "Statistics support claims" : "Add quantitative support", "Reference data points or percentages to substantiate claims.", statsDetail);

    var canonicalHref = get(dom,["canonical"],"");
    addCat("seo", 3, !!canonicalHref, "Canonical present", "Add <link rel=\"canonical\">.", canonicalHref ? "Canonical URL: " + canonicalHref : "No canonical link element detected.");

    var titleOkVal = !!get(dom,["titleOk"],false);
    var titleLength = Number(get(dom,["titleLength"],0)||0);
    addCat("seo", 3, titleOkVal, "Title length OK (10–70)", "Keep concise, descriptive titles.", titleLength ? "Title length: " + titleLength + " characters." : "Title missing or empty.");

    var metaDescOkVal = !!get(dom,["metaDescOk"],false);
    var metaDescLength = Number(get(dom,["metaDescriptionLength"],0)||0);
    addCat("seo", 3, metaDescOkVal, "Meta description OK (50–160)", "Add a helpful summary.", metaDescLength ? "Meta description length: " + metaDescLength + " characters." : "Meta description missing or empty.");

    var ogCountVal = get(dom,["ogCount"],0)||0;
    addCat("seo", 2, ogCountVal>0, "OpenGraph present", "Add og:* tags for rich previews.", ogCountVal>0 ? ogCountVal + " og:* tag(s) detected." : "No OpenGraph tags found.");

    var twitterCountVal = get(dom,["twitterCount"],0)||0;
    addCat("seo", 2, twitterCountVal>0, "Twitter Card present", "Add twitter:* tags.", twitterCountVal>0 ? twitterCountVal + " twitter:* tag(s) detected." : "No Twitter Card tags found.");

    // A11y
    var h1Total = get(dom,["h1Count"],0)||0;
    addCat("a11y", 3, h1Total===1, "Single <h1> present", "Use exactly one H1.", "Detected " + h1Total + " <h1> element(s).");

    var imagesMissingAlt = get(dom,["imgWithoutAlt"],0)||0;
    addCat("a11y", 3, imagesMissingAlt===0, "Images have alt", "Add alt attributes.", imagesMissingAlt===0 ? "All images include alt text." : imagesMissingAlt + " image(s) missing alt text.");

    var langSet = !!get(dom,["langOk"],false);
    var htmlLangVal = get(dom,["htmlLang"],"");
    addCat("a11y", 2, langSet, "html[lang] set", "Set <html lang=\"...\">.", langSet ? "html[lang] is set to '" + htmlLangVal + "'." : "html[lang] attribute not present.");

    var wordCount = get(dom,["mainWordCount"],0)||0;
    addCat("a11y", 2, wordCount>=300, "Substantive text (>=300 words)", "Add more helpful copy.", "Estimated main content word count: " + wordCount + ".");

    // Performance (heuristics)
    var lcp = get(dom,["perf","lcp"],null);
    var cls = get(dom,["perf","cls"],null);
    var inp = get(dom,["perf","inp"],null);
    var lcpOk = (lcp==null) ? true : (lcp<=2500);
    var clsOk = (typeof cls==="number") ? (cls<=0.1) : true;
    var inpOk = (inp==null) ? true : (inp<=200);

    var lcpDetail = "Observed LCP: " + (lcp==null?"not available": lcp + " ms") + ".";
    addCat("performance", 6, !!lcpOk, "LCP <= 2.5s (observed: "+(lcp==null?"--":lcp)+"ms)", "Optimize LCP element (hero text/image, critical CSS).", lcpDetail);

    var clsDetail = "Cumulative Layout Shift: " + (cls==null?"not available": cls) + ".";
    addCat("performance", 4, !!clsOk, "CLS <= 0.1 (observed: "+(cls==null?"--":cls)+")", "Reserve space for media, use font-display.", clsDetail);

    var inpDetail = "Interaction to Next Paint: " + (inp==null?"not available": inp + " ms") + ".";
    addCat("performance", 4, !!inpOk, "INP <= 200ms (observed: "+(inp==null?"--":inp)+"ms)", "Trim JS, avoid long tasks, defer non-critical work.", inpDetail);

    var enc = String(get(net,["root","headers","content-encoding"],"")).toLowerCase();
    var compressed = enc.indexOf("br")>=0 || enc.indexOf("gzip")>=0 || enc.indexOf("zstd")>=0;
    var cacheOk = /max-age=\d{3,}/i.test(String(get(net,["root","headers","cache-control"],"")));

    addCat("performance", 4, !!compressed, "Compression enabled (gzip/br)", "Enable Brotli/gzip on HTML and static assets.", compressed ? "Content-Encoding header indicates compression ('" + enc + "')." : "No compression header detected on initial response.");

    var cacheHeader = String(get(net,["root","headers","cache-control"],""));
    addCat("performance", 4, !!cacheOk, "Caching headers present", "Set Cache-Control/ETag on static assets.", cacheHeader ? "Cache-Control: " + cacheHeader : "No Cache-Control header detected.");

    var preconnectCount = get(dom,["resourceHints","preconnect"],0)||0;
    addCat("performance", 3, preconnectCount>0, "Preconnect present", "Add <link rel=\"preconnect\"> to critical origins.", preconnectCount>0 ? preconnectCount + " preconnect hint(s) found." : "No preconnect hints detected.");

    var preloadCount = get(dom,["resourceHints","preload"],0)||0;
    addCat("performance", 3, preloadCount>0, "Preload present", "Preload hero font/image/CSS.", preloadCount>0 ? preloadCount + " preload hint(s) found." : "No preload hints detected.");

    var imagesModernPct = Math.round(get(dom,["images","modernPct"],0)||0);
    var imagesCount = get(dom,["images","count"],0)||0;
    addCat("performance", 3, imagesModernPct>=70, "Modern images >=70% ("+imagesModernPct+"%)", "Prefer AVIF/WebP for large images.", imagesCount ? imagesModernPct + "% of " + imagesCount + " image(s) use modern formats." : "No images detected on page.");

    var imagesLazyPct = Math.round(get(dom,["images","lazyPct"],0)||0);
    addCat("performance", 3, imagesLazyPct>=70, "Lazy-loaded images >=70% ("+imagesLazyPct+"%)", "Use loading=\"lazy\" below the fold.", imagesCount ? imagesLazyPct + "% of " + imagesCount + " image(s) use loading=\"lazy\"." : "No images detected on page.");

    var fontsDisplay = !!get(dom,["fonts","haveDisplay"],false);
    addCat("performance", 2, fontsDisplay, "Fonts use font-display", "Use font-display: swap/optional.", fontsDisplay ? "font-display detected in inline styles." : "No font-display declaration found in detected stylesheets.");

    // Infinite scroll / crawlable pagination
    var hasPaginationLinks  = ((get(dom,["pagination","links"],[])||[]).length)>0;
    var infiniteObserved    = !!get(dom,["infinite","appendedOnScroll"],false);
    var pageFetchOK         = !!get(net,["paginationFetch","ok"],false);
    var paginationVisible   = !!get(dom,["pagination","visible"],false);
    var relNextPrevFound    = !!get(dom,["pagination","relNextPrev"],false);

    var infinitePatternOK =
      (infiniteObserved && hasPaginationLinks && pageFetchOK) ||
      (!infiniteObserved && hasPaginationLinks && pageFetchOK);
    var paginationLinksCount = (get(dom,["pagination","links"],[])||[]).length;
    var infiniteDetail = infinitePatternOK ?
      "Found " + paginationLinksCount + " pagination link(s) and a page 2 fetch succeeded." :
      "Missing pagination requirements (links: " + paginationLinksCount + ", page fetch success: " + (pageFetchOK ? "yes" : "no") + ").";
    addCat("infinite", 6, infinitePatternOK, "Crawlable pagination present (with or without infinite UI)", "Ensure page 2/3 links exist and return content server-side.", infiniteDetail);

    var paginationVisibilityDetail = paginationVisible ?
      "Pagination elements are visible in the DOM." :
      (relNextPrevFound ? "rel=next/prev link tags found." : "No visible pagination controls or rel hints detected.");
    addCat("infinite", 2, (paginationVisible || relNextPrevFound), paginationVisible ? "Pagination visible to users" : "rel=\"next/prev\" present", "Prefer visible anchor links; rel is only a hint.", paginationVisibilityDetail);

    var infiniteModeDetail = infiniteObserved ?
      "Additional content appended during scroll test." :
      "No infinite scroll behavior detected; relies on traditional pagination.";
    addCat("infinite", 2, true, infiniteObserved ? "Infinite scroll detected" : "Traditional pagination", infiniteObserved ? null : "If you want infinite UX, progressively append without hiding crawlable links.", infiniteModeDetail);

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
        geo:         { score: pct(CATS.geo.score,CATS.geo.max), items: CATS.geo.items },
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
