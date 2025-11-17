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
  var recommendationsEl  = document.getElementById("recommendations");
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

  var CATEGORY_ORDER = ["geo","seo","answer","a11y","performance","infinite"];
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

  function getErrorMessage(err){
    if (!err) return "";
    if (typeof err === "string") return err;
    if (typeof err.message === "string") return err.message;
    try { return String(err); }
    catch (e){ return ""; }
  }

  function isNoReceiverError(err){
    var msg = getErrorMessage(err);
    if (!msg) return false;
    if (msg.indexOf("Could not establish connection") !== -1) return true;
    if (msg.indexOf("Receiving end does not exist") !== -1) return true;
    if (msg.indexOf("The message port closed before a response was received") !== -1) return true;
    return false;
  }

  async function injectContentScript(tabId){
    if (!tabId) return false;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content.js"]
      });
      return true;
    } catch (err) {
      console.warn("[SRA] Unable to inject content.js", err);
      return false;
    }
  }

  async function requestDomInfoWithRetry(tabId, attempts){
    if (!tabId) return null;
    var maxAttempts = attempts && attempts > 0 ? attempts : 3;
    var lastError = null;
    var injected = false;
    for (var i=0; i<maxAttempts; i++){
      try {
        if (!injected || (lastError && isNoReceiverError(lastError))) {
          var injectedNow = await injectContentScript(tabId);
          injected = injected || injectedNow;
        }
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

  function recommendationSeverityValue(sev){
    if (sev === "high") return 3;
    if (sev === "medium") return 2;
    if (sev === "low") return 1;
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
      recommendations: single.recommendations,
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
      recommendations: [],
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

    var recommendationMap = {};
    var recommendationList = [];
    for (var si=0; si<list.length; si++){
      var pageRes = list[si].audit;
      var pageLabel = list[si].label;
      var pageRecs = pageRes.recommendations || [];
      for (var sj=0; sj<pageRecs.length; sj++){
        var rec = pageRecs[sj];
        if (!rec || !rec.text) continue;
        var cat = rec.category || "general";
        var sev = rec.severity || "medium";
        var text = rec.text;
        var key = cat + "|" + sev + "|" + text;
        var entry = recommendationMap[key];
        if (!entry) {
          entry = { category: cat, severity: sev, text: text, sources: [] };
          recommendationMap[key] = entry;
          recommendationList.push(entry);
        }
        if (entry.sources.indexOf(pageLabel) === -1) {
          entry.sources.push(pageLabel);
        }
      }
    }
    recommendationList.sort(function(a, b){
      var diff = recommendationSeverityValue(b.severity) - recommendationSeverityValue(a.severity);
      if (diff !== 0) return diff;
      return a.text.localeCompare(b.text);
    });
    agg.recommendations = recommendationList;

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
      geo:         { max: 25, score: 0, items: [] },
      seo:         { max: 25, score: 0, items: [] },
      answer:      { max: 20, score: 0, items: [] },
      a11y:        { max: 20, score: 0, items: [] },
      performance: { max: 35, score: 0, items: [] },
      infinite:    { max: 10, score: 0, items: [] }
    };

    var recommendations = [];
    function pushRecommendation(category, severity, text){
      if (!text) return;
      recommendations.push({
        category: category || "general",
        severity: severity || "medium",
        text: text
      });
    }

    function addCat(cat, weight, ok, text, recommendationText, detail, severity){
      var sev = severity || "medium";
      var state = ok ? "ok" : (sev === "high" ? "bad" : "warn");
      CATS[cat].items.push({
        state: state,
        text: text,
        detail: detail || "",
        fix: (!ok && recommendationText) ? recommendationText : ""
      });
      if (ok && weight) {
        CATS[cat].score += weight;
      }
      if (!ok && recommendationText) {
        pushRecommendation(cat, sev, recommendationText);
      }
    }

    // GEO / LLM readiness signals
    var aiBots = get(net, ["robots","bots"], {});
    var sitemapExists = get(net,["sitemap","exists"],false)===true;
    var sitemapDetail = sitemapExists ?
      "robots.txt references a sitemap or /sitemap.xml responded." :
      "No sitemap reference found in robots.txt and /sitemap.xml was unreachable.";
    addCat("seo", 6, sitemapExists, "Sitemap discoverable", "Expose /sitemap.xml (and reference it in robots.txt).", sitemapDetail, sitemapExists ? "low" : "high");

    var aiTxtOk   = get(net,["aiTxt","exists"],false)===true;
    var aiTxtStatus = get(net,["aiTxt","status"],0);
    var aiTxtUrl    = get(net,["aiTxt","url"],"");
    var aiTxtCt     = get(net,["aiTxt","ct"],"");
    var aiTxtDetail = aiTxtOk ?
      "Detected plain-text ai.txt at " + (aiTxtUrl || "/ai.txt") + (aiTxtCt ? " (" + aiTxtCt + ")" : "") + "." :
      "Response status " + aiTxtStatus + " or non-text content prevented detecting /ai.txt.";
    addCat("geo", 8, aiTxtOk, aiTxtOk ? "ai.txt present" : "ai.txt missing", "Publish /ai.txt to declare how AI/LLM tools may use your content.", aiTxtDetail, aiTxtOk ? "low" : "high");

    var llmsTxtOk = get(net,["llmsTxt","exists"],false)===true;
    var llmsStatus = get(net,["llmsTxt","status"],0);
    var llmsUrl    = get(net,["llmsTxt","url"],"");
    var llmsCt     = get(net,["llmsTxt","ct"],"");
    var llmsDetail = llmsTxtOk ?
      "Detected plain-text llms.txt at " + (llmsUrl || "/llms.txt") + (llmsCt ? " (" + llmsCt + ")" : "") + "." :
      "Response status " + llmsStatus + " or non-text content prevented detecting /llms.txt.";
    addCat("geo", 5, llmsTxtOk, llmsTxtOk ? "llms.txt present" : "llms.txt missing", "Expose /llms.txt if you want to advertise AI licensing terms.", llmsDetail, llmsTxtOk ? "low" : "medium");

    function botDetail(botName, allowed){
      return allowed ?
        botName + " is not disallowed in robots.txt." :
        botName + " is disallowed via robots.txt directives.";
    }

    var gptAllowed = get(aiBots,["GPTBot","allowed"],true)!==false;
    addCat("geo", 8, gptAllowed, "GPTBot not blocked", "Remove Disallow: / for GPTBot in robots.txt to enable GPT ingestion.", botDetail("GPTBot", gptAllowed), gptAllowed ? "low" : "high");

    var ccAllowed = get(aiBots,["CCBot","allowed"],true)!==false;
    addCat("geo", 6, ccAllowed, "CommonCrawl (CCBot) not blocked", "Allow CCBot unless you intend to block model training datasets.", botDetail("CCBot", ccAllowed), ccAllowed ? "low" : "high");

    var claudeAllowed = get(aiBots,["ClaudeBot","allowed"],true)!==false;
    addCat("geo", 4, claudeAllowed, "ClaudeBot not blocked", "Allow ClaudeBot if you want Anthropic models to use your site.", botDetail("ClaudeBot", claudeAllowed), claudeAllowed ? "low" : "medium");

    var perplexityAllowed = get(aiBots,["PerplexityBot","allowed"],true)!==false;
    addCat("geo", 2, perplexityAllowed, "PerplexityBot not blocked", "Allow PerplexityBot unless blocking is intentional.", botDetail("PerplexityBot", perplexityAllowed), perplexityAllowed ? "low" : "medium");

    var googleExtAllowed = get(aiBots,["Google-Extended","allowed"],true)!==false;
    addCat("geo", 2, googleExtAllowed, "Google-Extended not blocked", "Allow Google-Extended so Google can use your content for generative experiences.", botDetail("Google-Extended", googleExtAllowed), googleExtAllowed ? "low" : "medium");

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
    addCat("seo", 6, indexAllowed, "Indexing allowed", "Remove noindex directives so search engines can index the page.", indexDetail, indexAllowed ? "low" : "high");

    var aiDetail = directiveDetail(aiUseAllowed, "noai", xRobots.indexOf("noai")>=0, metaRobots.indexOf("noai")>=0);
    addCat("geo", 0, aiUseAllowed, aiUseAllowed ? "AI use allowed" : "AI use blocked via noai", "Remove noai directives if AI access is intended.", aiDetail, aiUseAllowed ? "low" : "high");
    var geoPenalty = aiUseAllowed ? 0 : 6;

    var jsonLdCount = get(dom,["jsonLdCount"],0)||0;
    addCat("seo", 5, jsonLdCount>0, "JSON-LD present", "Add schema.org JSON-LD (WebSite/Article/FAQ/etc).", jsonLdCount>0 ? jsonLdCount + " JSON-LD script tag(s) found." : "No JSON-LD script tags detected.", jsonLdCount>0 ? "low" : "medium");

    var canonicalHref = get(dom,["canonical"],"");
    addCat("seo", 3, !!canonicalHref, "Canonical present", "Add <link rel=\"canonical\"> to highlight the preferred URL.", canonicalHref ? "Canonical URL: " + canonicalHref : "No canonical link element detected.", canonicalHref ? "low" : "medium");

    var titleOkVal = !!get(dom,["titleOk"],false);
    var titleLength = Number(get(dom,["titleLength"],0)||0);
    addCat("seo", 3, titleOkVal, "Title length OK (10–70)", "Craft a concise, descriptive <title> between 10–70 characters.", titleLength ? "Title length: " + titleLength + " characters." : "Title missing or empty.", titleOkVal ? "low" : "medium");

    var metaDescOkVal = !!get(dom,["metaDescOk"],false);
    var metaDescLength = Number(get(dom,["metaDescriptionLength"],0)||0);
    addCat("seo", 2, metaDescOkVal, "Meta description OK (50–160)", "Write a meta description between 50–160 characters.", metaDescLength ? "Meta description length: " + metaDescLength + " characters." : "Meta description missing or empty.", metaDescOkVal ? "low" : "medium");

    // Answer engine optimization
    var answerSignals = get(dom, ["answer"], {}) || {};
    var faqSchemaOk = !!(get(answerSignals, ["faqSchema"], false) || get(answerSignals, ["qaSchema"], false) || (Number(get(answerSignals, ["faqMicrodataCount"], 0)) || 0) > 0);
    var faqDetailParts = [];
    if (get(answerSignals, ["faqSchema"], false)) faqDetailParts.push("FAQPage JSON-LD");
    if (get(answerSignals, ["qaSchema"], false)) faqDetailParts.push("QAPage JSON-LD");
    var faqMicroCount = Number(get(answerSignals, ["faqMicrodataCount"], 0)) || 0;
    if (faqMicroCount > 0) faqDetailParts.push(faqMicroCount + " FAQ microdata node(s)");
    var faqDetail = faqSchemaOk ? "Detected " + faqDetailParts.join(", ") + "." : "No FAQ/Q&A structured data detected in JSON-LD or microdata.";
    addCat("answer", 6, faqSchemaOk, faqSchemaOk ? "FAQ/Q&A structured data present" : "FAQ/Q&A structured data missing", "Add schema.org FAQPage or QAPage markup to feed answer engines.", faqDetail, faqSchemaOk ? "low" : "high");

    var howToOk = !!get(answerSignals, ["howToSchema"], false);
    var howToDetail = howToOk ? "HowTo schema detected in JSON-LD." : "No HowTo structured data detected.";
    addCat("answer", 4, howToOk, howToOk ? "HowTo schema present" : "HowTo schema missing", "Publish HowTo structured data for step-by-step content.", howToDetail, howToOk ? "low" : "medium");

    var speakableOk = !!get(answerSignals, ["speakableSchema"], false);
    var speakableDetail = speakableOk ? "SpeakableSpecification or speakable property detected." : "No speakable markup found.";
    addCat("answer", 2, speakableOk, speakableOk ? "Speakable markup present" : "Speakable markup missing", "Add speakable markup so assistants can quote summaries.", speakableDetail, speakableOk ? "low" : "medium");

    var faqAccordionCount = Number(get(answerSignals, ["faqAccordionCount"], 0)) || 0;
    var questionHeadingCount = Number(get(answerSignals, ["questionHeadingCount"], 0)) || 0;
    var faqModulesOk = (faqAccordionCount + questionHeadingCount) > 0;
    var faqModuleDetail = faqModulesOk ? faqAccordionCount + " accordion(s) and " + questionHeadingCount + " question heading(s) detected." : "No obvious FAQ accordion or question-style headings detected.";
    addCat("answer", 3, faqModulesOk, faqModulesOk ? "FAQ/Q&A modules detected" : "FAQ/Q&A modules missing", "Expose question-and-answer sections that map to user queries.", faqModuleDetail, faqModulesOk ? "low" : "medium");

    var summaryListCount = Number(get(answerSignals, ["keyTakeawayLists"], 0)) || 0;
    var hasSummaryList = !!get(answerSignals, ["hasSummaryList"], false);
    var tocDetected = !!get(answerSignals, ["hasTableOfContents"], false);
    var summaryDetailParts = [];
    summaryDetailParts.push(summaryListCount + " takeaway list(s)");
    summaryDetailParts.push(tocDetected ? "table of contents links detected" : "no table of contents links");
    var summaryDetail = "Summary signals: " + summaryDetailParts.join(", ") + ".";
    addCat("answer", 3, hasSummaryList || tocDetected, (hasSummaryList || tocDetected) ? "Summaries or TOC detected" : "No summaries/TOC detected", "Add a key takeaways list or table of contents near the top of the page.", summaryDetail, (hasSummaryList || tocDetected) ? "low" : "medium");

    var authorityCount = Number(get(dom, ["geo", "citationAuthorityCount"], 0)) || 0;
    var authorityOk = authorityCount > 0;
    var authorityDetail = authorityOk ? "Detected " + authorityCount + " authoritative outbound citation(s)." : "No .gov/.edu or research-style citations detected.";
    addCat("answer", 2, authorityOk, authorityOk ? "Authoritative citations present" : "Authoritative citations missing", "Link to authoritative sources to boost answer credibility.", authorityDetail, authorityOk ? "low" : "medium");

    // A11y
    var h1Total = get(dom,["h1Count"],0)||0;
    addCat("a11y", 6, h1Total===1, "Single <h1> present", "Ensure exactly one <h1> summarizes the page.", "Detected " + h1Total + " <h1> element(s).", h1Total===1 ? "low" : "medium");

    var imagesMissingAlt = get(dom,["imgWithoutAlt"],0)||0;
    addCat("a11y", 6, imagesMissingAlt===0, "Images have alt", "Add meaningful alt text for informative images.", imagesMissingAlt===0 ? "All images include alt text." : imagesMissingAlt + " image(s) missing alt text.", imagesMissingAlt===0 ? "low" : "medium");

    var langSet = !!get(dom,["langOk"],false);
    var htmlLangVal = get(dom,["htmlLang"],"");
    addCat("a11y", 4, langSet, "html[lang] set", "Set <html lang=\"...\"> for assistive tech.", langSet ? "html[lang] is set to '" + htmlLangVal + "'." : "html[lang] attribute not present.", langSet ? "low" : "medium");

    var wordCount = get(dom,["mainWordCount"],0)||0;
    addCat("a11y", 4, wordCount>=300, "Substantive text (>=300 words)", "Add at least 300 words of meaningful copy in the main region.", "Estimated main content word count: " + wordCount + ".", wordCount>=300 ? "low" : "medium");

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
        pushRecommendation("performance", "low", "Reload the page to capture " + label + " metrics and rerun the audit.");
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
      if (state !== "ok" && fix) pushRecommendation("performance", state === "bad" ? "high" : "medium", fix);
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
      if (overallState !== "ok" && overallFix) pushRecommendation("performance", overallState === "bad" ? "high" : "medium", overallFix);
    }

    var enc = String(get(net,["root","headers","content-encoding"],"")).toLowerCase();
    var compressed = enc.indexOf("br")>=0 || enc.indexOf("gzip")>=0 || enc.indexOf("zstd")>=0;
    var cacheOk = /max-age=\d{3,}/i.test(String(get(net,["root","headers","cache-control"],"")));

    addCat("performance", 5, !!compressed, "Compression enabled (gzip/br)", "Enable Brotli/gzip (or zstd) on HTML and static assets.", compressed ? "Content-Encoding header indicates compression ('" + enc + "')." : "No compression header detected on initial response.", compressed ? "low" : "medium");

    var cacheHeader = String(get(net,["root","headers","cache-control"],""));
    addCat("performance", 5, !!cacheOk, "Caching headers present", "Set Cache-Control with max-age >= 1000 for cacheable assets.", cacheHeader ? "Cache-Control: " + cacheHeader : "No Cache-Control header detected.", cacheOk ? "low" : "medium");

    var preconnectCount = get(dom,["resourceHints","preconnect"],0)||0;
    addCat("performance", 3, preconnectCount>0, "Preconnect present", "Add <link rel=\"preconnect\"> to critical third-party origins.", preconnectCount>0 ? preconnectCount + " preconnect hint(s) found." : "No preconnect hints detected.", preconnectCount>0 ? "low" : "low");

    var preloadCount = get(dom,["resourceHints","preload"],0)||0;
    addCat("performance", 3, preloadCount>0, "Preload present", "Preload critical hero assets (fonts, CSS, hero media).", preloadCount>0 ? preloadCount + " preload hint(s) found." : "No preload hints detected.", preloadCount>0 ? "low" : "low");

    var imagesModernPct = Math.round(get(dom,["images","modernPct"],0)||0);
    var imagesCount = get(dom,["images","count"],0)||0;
    var modernDetail = imagesCount ? imagesModernPct + "% of " + imagesCount + " image(s) use modern formats." : "No images detected on page.";
    addCat("performance", 2, imagesCount === 0 || imagesModernPct>=70, "Modern images >=70% ("+imagesModernPct+"%)", "Prefer AVIF/WebP (>=70%) for imagery.", modernDetail, (imagesCount === 0 || imagesModernPct>=70) ? "low" : "medium");

    var imagesLazyPct = Math.round(get(dom,["images","lazyPct"],0)||0);
    var lazyDetail = imagesCount ? imagesLazyPct + "% of " + imagesCount + " image(s) use loading=\"lazy\"." : "No images detected on page.";
    addCat("performance", 1, imagesCount === 0 || imagesLazyPct>=70, "Lazy-loaded images >=70% ("+imagesLazyPct+"%)", "Add loading=\"lazy\" to non-critical images below the fold.", lazyDetail, (imagesCount === 0 || imagesLazyPct>=70) ? "low" : "low");

    var fontsDisplay = !!get(dom,["fonts","haveDisplay"],false);
    addCat("performance", 1, fontsDisplay, "Fonts use font-display", "Add font-display: swap/optional to custom fonts.", fontsDisplay ? "font-display detected in inline styles." : "No font-display declaration found in detected stylesheets.", fontsDisplay ? "low" : "low");

    // Infinite scroll / crawlable pagination
    var hasPaginationLinks  = ((get(dom,["pagination","links"],[])||[]).length)>0;
    var infiniteObserved    = !!get(dom,["infinite","appendedOnScroll"],false);
    var pageFetchOK         = !!get(net,["paginationFetch","ok"],false);
    var paginationVisible   = !!get(dom,["pagination","visible"],false);
    var relNextPrevFound    = !!get(dom,["pagination","relNextPrev"],false);

    var infinitePatternOK = hasPaginationLinks && (!infiniteObserved || pageFetchOK);
    var paginationLinksCount = (get(dom,["pagination","links"],[])||[]).length;
    var infiniteMissing = [];
    if (!hasPaginationLinks) infiniteMissing.push("pagination links");
    if (infiniteObserved && !pageFetchOK) infiniteMissing.push("page fetch success");
    var infiniteDetail = infinitePatternOK ?
      "Found " + paginationLinksCount + " pagination link(s)" + (pageFetchOK ? " and a page 2 fetch succeeded." : ".") :
      "Missing pagination requirements: " + (infiniteMissing.length ? infiniteMissing.join(" and ") : "unknown cause") + ".";
    addCat("infinite", 7, infinitePatternOK, "Crawlable pagination present", "Expose crawlable page 2/3 links and ensure they return content.", infiniteDetail, infinitePatternOK ? "low" : "high");

    var paginationVisibilityDetail = paginationVisible ?
      "Pagination elements are visible in the DOM." :
      (relNextPrevFound ? "rel=next/prev link tags found." : "No visible pagination controls or rel hints detected.");
    addCat("infinite", 3, (paginationVisible || relNextPrevFound), paginationVisible ? "Pagination visible to users" : "rel=\"next/prev\" present", "Surface visible pagination links or add rel=next/prev hints.", paginationVisibilityDetail, (paginationVisible || relNextPrevFound) ? "low" : "medium");

    var infiniteModeDetail = infiniteObserved ?
      "Additional content appended during scroll test." :
      "No infinite scroll behavior detected; relies on traditional pagination.";
    addCat("infinite", 0, true, infiniteObserved ? "Infinite scroll detected" : "Traditional pagination", infiniteObserved ? null : "If you want infinite UX, progressively append without hiding crawlable links.", infiniteModeDetail);

    if (geoPenalty) {
      CATS.geo.score = Math.max(0, CATS.geo.score - geoPenalty);
    }

    Object.keys(CATS).forEach(function(catName){
      if (CATS[catName].score < 0) CATS[catName].score = 0;
      if (CATS[catName].score > CATS[catName].max) CATS[catName].score = CATS[catName].max;
    });

    var overallMax=0, got=0;
    Object.keys(CATS).forEach(function(k){ overallMax+=CATS[k].max; got+=CATS[k].score; });
    var overallPct = overallMax ? Math.round((got/overallMax)*100) : 0;

    // Key checks (top 12)
    var keyChecks = [];
    Object.keys(CATS).forEach(function(id){
      CATS[id].items.forEach(function(i){ keyChecks.push({ cat:id, state:i.state, text:i.text }); });
    });
    keyChecks = keyChecks.slice(0,12);

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
        geo:         { score: pct(CATS.geo.score,CATS.geo.max), items: CATS.geo.items },
        seo:         { score: pct(CATS.seo.score,CATS.seo.max), items: CATS.seo.items },
        answer:      { score: pct(CATS.answer.score,CATS.answer.max), items: CATS.answer.items },
        a11y:        { score: pct(CATS.a11y.score,CATS.a11y.max), items: CATS.a11y.items },
        performance: { score: pct(CATS.performance.score,CATS.performance.max), items: CATS.performance.items },
        infinite:    { score: pct(CATS.infinite.score,CATS.infinite.max), items: CATS.infinite.items }
      },
      keyChecks: keyChecks,
      recommendations: recommendations,
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
      var paginationLinksForNet = [];
      try {
        var rawLinks = get(domInfo, ["pagination", "links"], []);
        if (Array.isArray(rawLinks) && rawLinks.length) {
          paginationLinksForNet = rawLinks.filter(function(link){ return typeof link === "string" && link.trim(); });
        }
      } catch (linkErr) { /* ignore and fall back to empty list */ }

      netInfo = await chrome.runtime.sendMessage({ type: "COLLECT_NETWORK_INFO", url: url, paginationLinks: paginationLinksForNet });
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
                                   "Multiple issues detected. Tackle the top recommendations first.";
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
    var names = CATEGORY_ORDER.slice();
    for (var i=0;i<names.length;i++){
      var name = names[i];
      var cat = result.categories[name];
      if (!cat) continue;
      var li = document.createElement("li");
      var title = name === "geo" ? "GEO / LLM" :
        (name === "answer" ? "Answer Engine" :
        (name === "a11y" ? "Accessibility" : name.charAt(0).toUpperCase() + name.slice(1)));
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

    if (recommendationsEl) {
      recommendationsEl.innerHTML = "";
      var recs = result.recommendations || [];
      if (!recs.length) {
        var emptyLi = document.createElement("li");
        emptyLi.className = "muted";
        emptyLi.textContent = "No recommendations.";
        recommendationsEl.appendChild(emptyLi);
      } else {
        recs.sort(function(a, b){
          var diff = recommendationSeverityValue(b.severity) - recommendationSeverityValue(a.severity);
          if (diff !== 0) return diff;
          return (a.text || "").localeCompare(b.text || "");
        });
        for (var k=0;k<recs.length;k++){
          var rec = recs[k];
          var li3 = document.createElement("li");
          var sev = rec && rec.severity ? rec.severity.toLowerCase() : "medium";
          li3.className = "rec-" + sev;
          var catLabel = rec && rec.category ? rec.category.toUpperCase() : "GENERAL";
          var header = document.createElement("strong");
          header.textContent = "[" + catLabel + "]";
          li3.appendChild(header);
          li3.appendChild(document.createTextNode(" " + (rec && rec.text ? rec.text : "")));
          if (rec && rec.sources && rec.sources.length) {
            var span = document.createElement("span");
            span.className = "rec-source";
            var listSources = rec.sources.slice(0, 3);
            var labelText = listSources.join(", ");
            if (rec.sources.length > listSources.length) {
              labelText += " +" + (rec.sources.length - listSources.length) + " more";
            }
            span.textContent = " – " + labelText;
            li3.appendChild(span);
          }
          recommendationsEl.appendChild(li3);
        }
      }
    }
  }

  console.debug("[SRA] popup.js loaded");

})();
