// popup.js — MV3-safe, no optional chaining / nullish coalescing.
// Includes a background PING + retry before requesting COLLECT_NETWORK_INFO.
// Wrapped in an IIFE to keep globals tidy and stabilize line numbers.

import { scoreWebVitals, scoreLabelFromValue } from "./lighthouse_metrics.js";

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
  var pathList       = document.getElementById("pathList");
  var pageSummaries  = document.getElementById("pageSummaries");

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

  var CATEGORY_ORDER = ["performance","seo","geo","llm","a11y","infinite"];
  var lastReportKey = null;

  function resetProgress(){ if(progressEl) progressEl.innerHTML=""; }
  function pushProgress(text, state){
    if(!progressEl) return;
    var div = document.createElement("div");
    div.className = "progress-item" + (state ? " " + state : "");
    div.textContent = text;
    progressEl.appendChild(div);
  }

  function delay(ms){ return new Promise(function(res){ setTimeout(res, ms); }); }

  async function requestDomInfoWithRetry(tabId, attempts){
    if (!tabId) return null;
    var maxAttempts = attempts && attempts > 0 ? attempts : 3;
    var lastError = null;
    for (var i=0; i<maxAttempts; i++){
      try {
        return await chrome.tabs.sendMessage(tabId, { type: "COLLECT_DOM_INFO" });
      } catch (err) {
        lastError = err;
        if (i < maxAttempts - 1) {
          try { await delay(250 * (i + 1)); }
          catch (waitErr) { /* ignore */ }
          continue;
        }
        throw err;
      }
    }
    if (lastError) throw lastError;
    return null;
  }

  function shortLabel(url, origin){
    try {
      var u = new URL(url);
      if (origin && u.origin === origin) {
        var path = u.pathname || "/";
        var search = u.search || "";
        return path + search;
      }
      return u.origin + (u.pathname || "");
    } catch (e) {
      return url;
    }
  }

  function parseAdditionalTargets(text, baseUrl){
    var out = { urls: [], warnings: [] };
    if (!text) return out;
    var lines = text.split(/[\n,]/);
    var limit = 5;
    var seen = {};
    var baseHref = baseUrl && baseUrl.href ? baseUrl.href.replace(/#.*$/, "") : "";
    var baseOrigin = baseUrl && baseUrl.origin ? baseUrl.origin : "";
    for (var i=0;i<lines.length;i++){
      var raw = lines[i];
      if (!raw) continue;
      var trimmed = raw.trim();
      if (!trimmed) continue;
      var resolved = null;
      try {
        if (/^https?:/i.test(trimmed)) {
          var abs = new URL(trimmed);
          if (baseUrl && abs.origin !== baseUrl.origin) {
            out.warnings.push("Skipped '" + trimmed + "' – different origin.");
            continue;
          }
          resolved = abs.origin + abs.pathname + abs.search;
        } else {
          if (!baseOrigin) {
            out.warnings.push("Skipped '" + trimmed + "' – unable to resolve relative path without the active page origin.");
            continue;
          }
          var rel = new URL(trimmed, baseOrigin + "/");
          resolved = rel.origin + rel.pathname + rel.search;
        }
      } catch (e) {
        out.warnings.push("Skipped '" + trimmed + "' – invalid URL or path.");
        continue;
      }
      if (!resolved) continue;
      resolved = resolved.replace(/#.*$/, "");
      if (baseHref && resolved === baseHref) {
        out.warnings.push("Skipped '" + trimmed + "' – already auditing active page.");
        continue;
      }
      if (seen[resolved]) {
        out.warnings.push("Skipped '" + trimmed + "' – duplicate entry.");
        continue;
      }
      if (out.urls.length >= limit) {
        out.warnings.push("Ignored '" + trimmed + "' – only the first " + limit + " additional paths are scanned.");
        continue;
      }
      seen[resolved] = true;
      out.urls.push(resolved);
    }
    return out;
  }

  async function waitForTabComplete(tabId){
    if (!tabId) return;
    try {
      var tab = await chrome.tabs.get(tabId);
      if (tab && tab.status === "complete") return;
    } catch (e) {}
    return new Promise(function(resolve){
      var timeout = setTimeout(function(){
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 15000);
      function listener(updatedId, info){
        if (updatedId === tabId && info && info.status === "complete"){
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  function severityValue(state){
    if (state === "bad") return 3;
    if (state === "warn") return 2;
    if (state === "ok") return 1;
    return 0;
  }

  function aggregatePageResults(pages, origin){
    var list = Array.isArray(pages) ? pages.filter(function(p){ return p && p.audit; }) : [];
    if (!list.length) {
      return computeAudit({ url: origin || "" }, { url: origin || "" });
    }

    var metaPages = list.map(function(page){
      return {
        url: page.url,
        label: page.label,
        result: page.audit
      };
    });

    if (list.length === 1) {
      var single = list[0].audit;
      var singleMeta = single.meta && single.meta.url ? single.meta.url : list[0].url;
      return {
        meta: { url: singleMeta, multi: { count: 1, origin: origin || "", pages: metaPages } },
        overall: single.overall,
        categories: single.categories,
        keyChecks: single.keyChecks,
        suggestions: single.suggestions,
        lighthouse: single.lighthouse,
        dom: single.dom,
        net: single.net
      };
    }

    var agg = {
      meta: {
        url: origin ? origin + " (" + list.length + " pages)" : (list[0].audit.meta && list[0].audit.meta.url) || "",
        multi: { count: list.length, origin: origin || "", pages: metaPages }
      },
      overall: { score: 0, grade: "F" },
      categories: {},
      keyChecks: [],
      suggestions: [],
      lighthouse: list[0].audit.lighthouse,
      dom: list[0].audit.dom,
      net: list[0].audit.net
    };

    var overallTotal = 0;
    var catTotals = {};
    for (var ci=0; ci<CATEGORY_ORDER.length; ci++) {
      catTotals[CATEGORY_ORDER[ci]] = 0;
    }

    for (var i=0;i<list.length;i++){
      var res = list[i].audit;
      var overallScore = res.overall && res.overall.score != null ? Number(res.overall.score) || 0 : 0;
      overallTotal += overallScore;
      for (var j=0;j<CATEGORY_ORDER.length;j++){
        var catName = CATEGORY_ORDER[j];
        var catObj = res.categories && res.categories[catName];
        var catScore = catObj && catObj.score != null ? Number(catObj.score) || 0 : 0;
        catTotals[catName] += catScore;
      }
    }

    var avgOverall = overallTotal / list.length;
    if (avgOverall !== avgOverall) avgOverall = 0;
    var roundedOverall = Math.round(avgOverall);
    agg.overall.score = roundedOverall;
    agg.overall.grade = gradeFromScore(roundedOverall);

    for (var k=0;k<CATEGORY_ORDER.length;k++){
      var name = CATEGORY_ORDER[k];
      var avg = catTotals[name] / list.length;
      if (avg !== avg) avg = 0;
      var catScoreRounded = Math.round(avg);
      var combinedItems = [];
      for (var li=0; li<list.length; li++){
        var page = list[li];
        var cat = page.audit.categories && page.audit.categories[name];
        if (!cat || !cat.items) continue;
        for (var ii=0; ii<cat.items.length; ii++){
          var item = cat.items[ii];
          if (!item) continue;
          combinedItems.push({
            state: item.state,
            text: "[" + page.label + "] " + item.text,
            detail: item.detail,
            fix: item.fix
          });
        }
      }
      agg.categories[name] = { score: catScoreRounded, items: combinedItems };
    }

    var combinedChecks = [];
    for (var pi=0; pi<list.length; pi++){
      var pageRes = list[pi].audit;
      var label = list[pi].label;
      var kc = pageRes.keyChecks || [];
      for (var ki=0; ki<kc.length; ki++){
        var entry = kc[ki];
        if (!entry) continue;
        combinedChecks.push({
          cat: entry.cat,
          state: entry.state,
          text: "[" + label + "] " + entry.text
        });
      }
    }
    combinedChecks.sort(function(a,b){ return severityValue(b.state) - severityValue(a.state); });
    agg.keyChecks = combinedChecks.slice(0,12);

    var suggestionSeen = {};
    var suggestionList = [];
    for (var si=0; si<list.length; si++){
      var pageSug = list[si].audit.suggestions || [];
      var pageLabel = list[si].label;
      for (var sj=0; sj<pageSug.length; sj++){
        var suggestion = "[" + pageLabel + "] " + pageSug[sj];
        if (suggestionSeen[suggestion]) continue;
        suggestionSeen[suggestion] = true;
        suggestionList.push(suggestion);
      }
    }
    agg.suggestions = suggestionList;

    return agg;
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
      (async function run(){
        try {
          runBtn.disabled = true;
          if (reportBtn) reportBtn.disabled = true;
          resetProgress();
          if (pageSummaries) { pageSummaries.innerHTML = ""; pageSummaries.style.display = "none"; }
          pushProgress("Starting audit…");
          if (summaryText) summaryText.textContent = "Running audit…";

          var tabs = await chrome.tabs.query({ active:true, currentWindow:true });
          var tab = tabs && tabs[0];

          if (!tab || !tab.id || !/^https?:/i.test(tab.url || "")) {
            if (summaryText) summaryText.textContent = "Open a normal web page (http/https) to run the audit.";
            pushProgress("Active tab is not a standard web page.", "warn");
            return;
          }

          var baseUrl = null;
          try { baseUrl = new URL(tab.url); }
          catch (e) {
            pushProgress("Unable to parse active tab URL.", "warn");
            if (summaryText) summaryText.textContent = "Unable to parse the active tab URL.";
            return;
          }
          var origin = baseUrl.origin;

          var parsed = parseAdditionalTargets(pathList ? pathList.value : "", baseUrl);
          for (var w=0; w<parsed.warnings.length; w++){
            pushProgress(parsed.warnings[w], "warn");
          }

          var targets = [];
          var seenMap = {};
          function addTarget(url, label, reuseId){
            if (!url || seenMap[url]) return;
            seenMap[url] = true;
            targets.push({ url: url, label: label, reuseTabId: reuseId });
          }

          addTarget(tab.url, shortLabel(tab.url, origin), tab.id);
          for (var i=0; i<parsed.urls.length; i++){
            addTarget(parsed.urls[i], shortLabel(parsed.urls[i], origin), null);
          }

          if (!targets.length){
            pushProgress("No eligible URLs to audit.", "warn");
            if (summaryText) summaryText.textContent = "No eligible URLs to audit.";
            return;
          }

          pushProgress("Waking background worker…");
          var awake = await ensureWorkerAwake();
          pushProgress(awake ? "Background worker awake." : "Background worker not responding; continuing with limited checks.", awake ? "done" : "warn");
          if (!awake && summaryText) {
            summaryText.textContent = "Background didn’t start. Reload the extension, then try again.";
          }

          var pages = [];
          for (var idx=0; idx<targets.length; idx++){
            var target = targets[idx];
            pushProgress("Auditing " + target.label + " (" + (idx+1) + "/" + targets.length + ")…");
            var pageResult = await auditPage(target, origin);
            pages.push(pageResult);
          }

          var aggregated = aggregatePageResults(pages, origin);
          render(aggregated);
          pushProgress("Audit complete.", "done");

          lastReportKey = "audit-" + Math.random().toString(36).slice(2);
          var saveObj = {}; saveObj[lastReportKey] = aggregated;
          await chrome.storage.local.set(saveObj);

          if (reportBtn) reportBtn.disabled = false;

        } catch (err) {
          console.error("[SRA] Fatal error in run():", err);
          if (summaryText) summaryText.textContent = "Unexpected error. Open the popup console for details.";
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
      performance: { max: 42, score: 0, items: [] },
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

    // Performance (Lighthouse curves + heuristics)
    var lcp = get(dom,["perf","lcp"],null);
    var cls = get(dom,["perf","cls"],null);
    var inp = get(dom,["perf","inp"],null);
    var lighthousePerf = scoreWebVitals({ lcp: lcp, cls: cls, inp: inp });
    var lighthouseMetrics = lighthousePerf && lighthousePerf.metrics ? lighthousePerf.metrics : {};
    var lighthousePoints = { lcp: 10, cls: 4, inp: 6 };
    var lighthouseAdvice = {
      lcp: "Optimize hero content and critical rendering path to reduce LCP.",
      cls: "Reserve space for media, use font-display, and avoid layout shifts.",
      inp: "Reduce long tasks and JavaScript execution to improve interaction latency."
    };

    function addLighthouseMetric(metricId, fallbackLabel) {
      var metric = lighthouseMetrics && lighthouseMetrics[metricId] ? lighthouseMetrics[metricId] : null;
      var label = fallbackLabel;
      if (metric && metric.label) label = metric.label;
      var weight = lighthousePoints && lighthousePoints[metricId] != null ? lighthousePoints[metricId] : 0;
      if (!metric || metric.scoreValue == null) {
        CATS.performance.items.push({
          state: "warn",
          text: label + " metric unavailable",
          detail: "Lighthouse did not capture " + label + " during this audit run.",
          fix: "Reload the page and rerun the audit to capture " + label + "."
        });
        addSuggestion("Reload the page to capture " + label + " for Lighthouse scoring.");
        return;
      }

      var bucket = scoreLabelFromValue(metric.scoreValue);
      var state = bucket === "good" ? "ok" : (bucket === "needs-improvement" ? "warn" : "bad");
      var percentScore = metric.score != null ? metric.score : Math.round(metric.scoreValue * 100);
      var detail = label + " measured at " + metric.displayValue + ".";
      if (metric.reference) {
        detail += " Scored via Lighthouse " + (metric.scoring || "") + " curve (p10=" + metric.reference.p10 + ", median=" + metric.reference.median + ").";
      }
      detail += " Lighthouse score " + percentScore + "/100.";
      var fix = state === "ok" ? "" : (lighthouseAdvice && lighthouseAdvice[metricId] ? lighthouseAdvice[metricId] : "Consult Lighthouse guidance to improve this metric.");
      CATS.performance.items.push({
        state: state,
        text: label + " (" + metric.displayValue + ")",
        detail: detail,
        fix: fix
      });
      if (metric.scoreValue != null) {
        CATS.performance.score += weight * metric.scoreValue;
      }
      if (state !== "ok" && fix) addSuggestion(fix);
    }

    addLighthouseMetric("lcp", "Largest Contentful Paint");
    addLighthouseMetric("cls", "Cumulative Layout Shift");
    addLighthouseMetric("inp", "Interaction to Next Paint");

    if (lighthousePerf && lighthousePerf.overallScore != null) {
      var overallState = lighthousePerf.overallScore >= 90 ? "ok" : (lighthousePerf.overallScore >= 60 ? "warn" : "bad");
      var overallFix = overallState === "ok" ? "" : "Improve Core Web Vitals to raise your Lighthouse performance score.";
      var overallDetail = "Weighted Lighthouse score from LCP, CLS, and INP (" + (lighthousePerf.source || "Lighthouse") + ").";
      CATS.performance.items.push({
        state: overallState,
        text: "Lighthouse performance score " + lighthousePerf.overallScore + "/100",
        detail: overallDetail,
        fix: overallFix
      });
      if (overallState !== "ok" && overallFix) addSuggestion(overallFix);
    }

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

    var lighthouseStore = {
      source: lighthousePerf && lighthousePerf.source ? lighthousePerf.source : "",
      overallScore: lighthousePerf && lighthousePerf.overallScore != null ? lighthousePerf.overallScore : null,
      overallScoreValue: lighthousePerf && lighthousePerf.overallScoreValue != null ? lighthousePerf.overallScoreValue : null,
      weightTotal: lighthousePerf && lighthousePerf.weightTotal != null ? lighthousePerf.weightTotal : null,
      metrics: {}
    };
    if (lighthousePerf && lighthousePerf.metrics) {
      for (var mKey in lighthousePerf.metrics) {
        if (!Object.prototype.hasOwnProperty.call(lighthousePerf.metrics, mKey)) continue;
        var metricObj = lighthousePerf.metrics[mKey];
        var metricEntry = {
          label: metricObj && metricObj.label ? metricObj.label : mKey,
          value: metricObj && metricObj.value != null ? metricObj.value : null,
          displayValue: metricObj && metricObj.displayValue != null ? metricObj.displayValue : "—",
          score: metricObj && metricObj.score != null ? metricObj.score : null,
          scoreValue: metricObj && metricObj.scoreValue != null ? metricObj.scoreValue : null,
          weight: metricObj && metricObj.weight != null ? metricObj.weight : null,
          scoring: metricObj && metricObj.scoring ? metricObj.scoring : "",
          reference: metricObj && metricObj.reference ? metricObj.reference : null,
          points: lighthousePoints && lighthousePoints[mKey] != null ? lighthousePoints[mKey] : null,
          earnedPoints: metricObj && metricObj.scoreValue != null && lighthousePoints && lighthousePoints[mKey] != null ? Math.round(metricObj.scoreValue * lighthousePoints[mKey] * 100) / 100 : null
        };
        lighthouseStore.metrics[mKey] = metricEntry;
      }
    }

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
      lighthouse: lighthouseStore,
      dom: dom,
      net: net
    };
  }

  async function auditPage(target, origin){
    var url = target && target.url ? target.url : "";
    var label = target && target.label ? target.label : shortLabel(url, origin);
    var reuseTabId = target && target.reuseTabId ? target.reuseTabId : null;
    var domInfo = null;
    var netInfo = null;
    var createdTabId = null;

    if (!url) {
      pushProgress("Skipped empty URL entry.", "warn");
      var fallback = computeAudit({ url: origin || "" }, { url: origin || "" });
      return { url: url, label: label, audit: fallback };
    }

    if (reuseTabId) {
      try {
        pushProgress("Collecting DOM data for " + label + "…");
        domInfo = await requestDomInfoWithRetry(reuseTabId, 3);
        pushProgress(domInfo ? "DOM data collected for " + label + "." : "DOM data unavailable for " + label + ".", domInfo ? "done" : "warn");
      } catch (e1) {
        console.warn("[SRA] DOM info fetch failed (active tab):", e1);
        pushProgress("DOM data request failed for " + label + ".", "warn");
      }
    } else {
      try {
        pushProgress("Opening " + label + " in background…");
        var newTab = await chrome.tabs.create({ url: url, active: false });
        createdTabId = newTab && newTab.id ? newTab.id : null;
        if (createdTabId) {
          await waitForTabComplete(createdTabId);
          await delay(250);
          pushProgress("Collecting DOM data for " + label + "…");
          try {
            domInfo = await requestDomInfoWithRetry(createdTabId, 3);
            pushProgress(domInfo ? "DOM data collected for " + label + "." : "DOM data unavailable for " + label + ".", domInfo ? "done" : "warn");
          } catch (e2) {
            console.warn("[SRA] DOM info fetch failed (background tab):", e2);
            pushProgress("DOM data request failed for " + label + ".", "warn");
          }
        } else {
          pushProgress("Unable to create background tab for " + label + ".", "warn");
        }
      } catch (createErr) {
        console.warn("[SRA] Tab creation failed for", url, createErr);
        pushProgress("Unable to capture DOM for " + label + ".", "warn");
      } finally {
        if (createdTabId) {
          try { await chrome.tabs.remove(createdTabId); } catch (removeErr) {}
        }
      }
    }

    if (!domInfo) domInfo = { url: url };
    else if (!domInfo.url) domInfo.url = url;

    try {
      pushProgress("Scanning network endpoints for " + label + "…");
      netInfo = await chrome.runtime.sendMessage({ type: "COLLECT_NETWORK_INFO", url: url });
      pushProgress(netInfo ? "Network scan complete for " + label + "." : "Network scan unavailable for " + label + ".", netInfo ? "done" : "warn");
    } catch (e3) {
      console.warn("[SRA] Network info fetch failed for", url, e3);
      pushProgress("Network scan failed for " + label + ".", "warn");
    }

    if (!netInfo) netInfo = { url: url };

    var audit = computeAudit(domInfo || {}, netInfo || {});
    if (!audit.meta) audit.meta = {};
    if (!audit.meta.url) audit.meta.url = url;
    return { url: url, label: label, audit: audit };
  }

  // ---------- render ----------
  function render(result){
    scoreEl.textContent = result.overall.score;
    gradeEl.textContent = result.overall.grade;

    var summaryLine =
      result.overall.score >= 90 ? "Excellent overall readiness." :
      result.overall.score >= 75 ? "Good foundation—fix the top warnings." :
                                   "Multiple issues detected. Fix top suggestions first.";
    var multi = result.meta && result.meta.multi ? result.meta.multi : null;
    if (multi && multi.count > 1) {
      summaryLine = multi.count + " pages scanned. " + summaryLine;
    }
    if (result.lighthouse && result.lighthouse.overallScore != null) {
      summaryLine += " Lighthouse performance score " + result.lighthouse.overallScore + "/100.";
    }
    summaryText.textContent = summaryLine;

    if (pageSummaries) {
      pageSummaries.innerHTML = "";
      if (multi && multi.pages && multi.pages.length) {
        pageSummaries.style.display = "block";
        for (var ps=0; ps<multi.pages.length; ps++){
          var entry = multi.pages[ps];
          if (!entry) continue;
          var pageResult = entry.result || {};
          var labelText = entry.label || (pageResult.meta && pageResult.meta.url) || entry.url || ("Page " + (ps + 1));
          var scoreVal = pageResult.overall && pageResult.overall.score != null ? pageResult.overall.score : "—";
          var gradeVal = pageResult.overall && pageResult.overall.grade ? pageResult.overall.grade : "—";
          var li = document.createElement("li");
          var strong = document.createElement("strong");
          strong.textContent = labelText;
          li.appendChild(strong);
          li.appendChild(document.createTextNode(": " + scoreVal + "/100 (" + gradeVal + ")"));
          pageSummaries.appendChild(li);
        }
      } else {
        pageSummaries.style.display = "none";
      }
    }

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
