/**
 * AlumniSync — Content Script (v4 — LinkedIn 2025)
 *
 * LinkedIn unmounts DOM nodes for sections you scroll past (React virtualization).
 * So DOM scraping fails at the bottom of the page.
 *
 * Primary strategy: LinkedIn always injects JSON-LD structured data in <head>
 * which contains name, college, company, and job title — regardless of scroll.
 *
 * Secondary: DOM text from sections still in the DOM (top of page).
 */

(function () {
  "use strict";

  // -------------------------------------------------------------------------
  // STRATEGY 1: JSON-LD structured data
  // LinkedIn includes <script type="application/ld+json"> in <head>.
  // This is ALWAYS present and never affected by virtualization.
  // -------------------------------------------------------------------------

  function extractFromJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');

    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);

        // LinkedIn wraps profile data in a ProfilePage entity
        const entity =
          data["@type"] === "ProfilePage" && data.mainEntity
            ? data.mainEntity
            : data["@type"] === "Person"
            ? data
            : null;

        if (!entity || entity["@type"] !== "Person") continue;

        // College: alumniOf → most recent (last) entry
        const alumniOf = entity.alumniOf;
        const college = Array.isArray(alumniOf)
          ? alumniOf[alumniOf.length - 1]?.name || null
          : alumniOf?.name || null;

        // Company: worksFor → first entry
        const worksFor = entity.worksFor;
        const current_company = Array.isArray(worksFor)
          ? worksFor[0]?.name || null
          : worksFor?.name || null;

        // Title: jobTitle can be a string or array
        const jobTitle = entity.jobTitle;
        const current_title = Array.isArray(jobTitle)
          ? jobTitle.filter(Boolean)[0] || null
          : jobTitle || null;

        return {
          full_name: entity.name || null,
          bio: entity.description || null,
          college,
          current_company,
          current_title,
        };
      } catch (_) {}
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // STRATEGY 2: Meta tags (supplemental)
  // -------------------------------------------------------------------------

  function extractFromMeta() {
    function meta(name) {
      const el =
        document.querySelector(`meta[property="${name}"]`) ||
        document.querySelector(`meta[name="${name}"]`);
      return el ? (el.getAttribute("content") || "").trim() : null;
    }

    // og:title → "Name | LinkedIn" → extract name
    const ogTitle = meta("og:title");
    let full_name = null;
    if (ogTitle) {
      const n = ogTitle.split(/[|\u2013\u2014\-]/)[0].trim();
      if (n.length > 1 && !/linkedin/i.test(n)) full_name = n;
    }

    return { full_name };
  }

  // -------------------------------------------------------------------------
  // STRATEGY 3: DOM extraction (works when sections ARE in the DOM)
  // -------------------------------------------------------------------------

  /** Extract text from visible elements only (aria-hidden="true" = visible in LinkedIn) */
  function visibleTexts(container) {
    if (!container) return [];
    // LinkedIn marks its visible text with aria-hidden="true" (to avoid SR duplication)
    const spans = Array.from(container.querySelectorAll('[aria-hidden="true"]'));
    const seen = new Set();
    return spans
      .map((el) => el.innerText.trim())
      .filter((t) => t && !seen.has(t) && seen.add(t));
  }

  /** Parse a string for 4-digit year pairs */
  function parseYears(str) {
    if (!str) return { start_year: null, end_year: null };
    const yrs = (str.match(/\b(19|20)\d{2}\b/g) || []).map(Number);
    return { start_year: yrs[0] || null, end_year: yrs[1] || null };
  }

  function isPresent(str) {
    return /present|current|now/i.test(str || "");
  }

  function cleanText(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  function uniqueTexts(values) {
    const seen = new Set();
    return values
      .map(cleanText)
      .filter((value) => value && !seen.has(value.toLowerCase()) && seen.add(value.toLowerCase()));
  }

  /** Find a section by id or by searching for an h2 whose text matches */
  function findSection(id) {
    // Try direct ID first
    const byId = document.querySelector(`#${id}`);
    if (byId) {
      // If the id element has list items, return it
      if (byId.querySelectorAll("li").length > 0) return byId;
      // Otherwise walk up to find the nearest ancestor with list items
      let node = byId;
      for (let i = 0; i < 5; i++) {
        node = node.parentElement;
        if (!node) break;
        if (node.querySelectorAll("li").length > 0) return node;
      }
    }

    // Fallback: scan all h2 headings
    for (const h of document.querySelectorAll("h2")) {
      if (h.innerText.trim().toLowerCase() === id) {
        let node = h;
        for (let i = 0; i < 8; i++) {
          node = node.parentElement;
          if (!node) break;
          if (node.querySelectorAll("li").length > 0) return node;
        }
      }
    }

    return null;
  }

  function extractEducationFromDom() {
    const section = findSection("education");
    if (!section) return null;

    const items = section.querySelectorAll("li");
    if (!items.length) return null;

    const first = items[0];
    const texts = visibleTexts(first);

    // If no aria-hidden spans, fall back to line-by-line innerText
    const lines = texts.length
      ? texts
      : first.innerText.split("\n").map((l) => l.trim()).filter(Boolean);

    // Deduplicate consecutive identical entries
    const deduped = lines.filter((l, i) => i === 0 || l !== lines[i - 1]);

    const schoolName = deduped[0] || null;
    let degree = null;
    let field_of_study = null;
    let dateText = null;
    let currently_studying = false;

    for (let i = 1; i < deduped.length; i++) {
      const t = deduped[i];
      if (/\b(19|20)\d{2}\b/.test(t) || isPresent(t)) {
        dateText = t;
        const { end_year } = parseYears(t);
        currently_studying = isPresent(t) && !end_year;
        break;
      }
      if (!degree && t.length < 200) {
        const parts = t.split(",").map((p) => p.trim());
        degree = parts[0] || null;
        field_of_study = parts[1] || null;
        if (!field_of_study && deduped[i + 1] && !/\b(19|20)\d{2}\b/.test(deduped[i + 1])) {
          field_of_study = deduped[i + 1];
        }
      }
    }

    const { start_year, end_year } = parseYears(dateText);
    return { college: schoolName, degree, field_of_study, start_year, end_year, currently_studying };
  }

  function extractExperienceFromDom() {
    const section = findSection("experience");
    if (!section) return null;

    const items = section.querySelectorAll("li");
    if (!items.length) return null;

    const first = items[0];
    const texts = visibleTexts(first);
    const lines = texts.length
      ? texts
      : first.innerText.split("\n").map((l) => l.trim()).filter(Boolean);
    const deduped = lines.filter((l, i) => i === 0 || l !== lines[i - 1]);

    const current_title = deduped[0] || null;
    const current_company = deduped[1] || null;

    const past_titles = [];
    const past_companies = [];
    for (let i = 1; i < items.length; i++) {
      const t = visibleTexts(items[i]);
      const d = t.length
        ? t
        : items[i].innerText.split("\n").map((l) => l.trim()).filter(Boolean);
      const dd = d.filter((l, i) => i === 0 || l !== d[i - 1]);
      if (dd[0]) past_titles.push(dd[0]);
      if (dd[1]) past_companies.push(dd[1]);
    }

    return {
      current_title,
      current_company,
      past_titles: uniqueTexts(past_titles),
      past_companies: uniqueTexts(past_companies),
    };
  }

  function extractListSection(sectionName) {
    const section = findSection(sectionName);
    let container = section;
    if (!container) {
      const heading = Array.from(document.querySelectorAll("h2, h3")).find(
        (element) => cleanText(element.innerText).toLowerCase() === sectionName
      );
      container = heading?.closest("section") || heading?.parentElement;
    }
    if (!container) return [];

    const items = container.querySelectorAll("li, [role='listitem'], button, a");
    const values = Array.from(items).map((item) => {
      const lines = visibleTexts(item);
      return lines[0] || cleanText(item.innerText).split("\n")[0];
    });
    return uniqueTexts(values);
  }

  function extractSkills() {
    return extractListSection("skills");
  }

  function extractProjects() {
    return extractListSection("projects");
  }

  function extractCertifications() {
    return extractListSection("certifications");
  }

  function extractBasicInfo() {
    const profile = extractFromJsonLd() || {};

    if (!profile.full_name) {
      profile.full_name = extractFromMeta().full_name;
    }
    if (!profile.full_name) profile.full_name = extractNameFromDom();
    if (!profile.full_name) {
      const title = document.title.replace(/^\(\d+\)\s*/, "").split(/[|\u2013\u2014\-]/)[0].trim();
      if (title.length > 1 && !/linkedin/i.test(title)) profile.full_name = title;
    }

    profile.location = extractLocationFromDom() || extractLocationFromPageText(profile.full_name);
    return profile;
  }

  function extractLocationFromDom() {
    // Location appears near the top of the page and is unlikely to be virtualized
    // Scan the first 60 aria-hidden spans or all spans in the top card
    const topArea = document.querySelector("main > section, section.artdeco-card");
    const pool = topArea
      ? topArea.querySelectorAll('[aria-hidden="true"], span')
      : document.querySelectorAll('[aria-hidden="true"]');

    for (const el of Array.from(pool).slice(0, 60)) {
      const text = el.innerText?.trim() || "";
      if (
        text.length >= 3 &&
        text.length <= 80 &&
        text.includes(",") &&
        !/\d{4}/.test(text) &&
        !/http|linkedin|connect|follow|message|degree|bachelor|master|engineer|tech|science|analyst|developer|software|data|product|intern/i.test(text)
      ) {
        return text;
      }
    }
    return null;
  }

  function extractNameFromDom() {
    const h1 = document.querySelector("h1");
    if (h1 && h1.innerText.trim().length > 1) return h1.innerText.trim();
    return null;
  }

  // -------------------------------------------------------------------------
  // STRATEGY 4: Page body text parsing (last resort for location)
  // LinkedIn's top card text (name, headline, location) is always in the DOM.
  // -------------------------------------------------------------------------

  function extractLocationFromPageText(knownName) {
    // The top section text order is typically:
    // Name → Headline → Location
    // We find the line after the headline that looks like a location
    const fullText = (document.querySelector("main") || document.body).innerText;
    const lines = fullText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 2 && l.length < 80);

    // Find name position in text
    const nameIdx = lines.findIndex(
      (l) => knownName && l.toLowerCase() === knownName.toLowerCase()
    );
    const searchFrom = nameIdx >= 0 ? nameIdx + 1 : 0;
    const searchTo = Math.min(searchFrom + 15, lines.length);

    for (let i = searchFrom; i < searchTo; i++) {
      const t = lines[i];
      if (
        t.includes(",") &&
        !/\d{4}/.test(t) &&
        !/degree|bachelor|master|engineer|tech|science|http|follow|connect|message|linkedin/i.test(t)
      ) {
        return t;
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Main profile extractor — combines all strategies
  // -------------------------------------------------------------------------

  function extractProfile() {
    const profile_url = window.location.href.split("?")[0];
    const result = {
      profile_url,
      source: "linkedin-extension",
      past_companies: [],
      past_titles: [],
      skills: [],
      projects: [],
      certifications: [],
    };
    Object.assign(result, extractBasicInfo());

    // Education — try DOM (in DOM when user is near top of profile)
    const domEdu = extractEducationFromDom();
    if (domEdu) {
      // DOM education fills in fields that JSON-LD doesn't provide (years, degree)
      if (!result.college && domEdu.college) result.college = domEdu.college;
      if (domEdu.degree) result.degree = domEdu.degree;
      if (domEdu.field_of_study) result.field_of_study = domEdu.field_of_study;
      if (domEdu.start_year) result.start_year = domEdu.start_year;
      if (domEdu.end_year) result.end_year = domEdu.end_year;
      if (domEdu.currently_studying) result.currently_studying = true;
    } else {
      result.currently_studying = false;
    }

    // Experience — try DOM (fills in what JSON-LD provides + past positions)
    const domExp = extractExperienceFromDom();
    if (domExp) {
      if (!result.current_title && domExp.current_title) result.current_title = domExp.current_title;
      if (!result.current_company && domExp.current_company) result.current_company = domExp.current_company;
      if (domExp.past_titles.length) result.past_titles = domExp.past_titles;
      if (domExp.past_companies.length) result.past_companies = domExp.past_companies;
    }

    result.skills = extractSkills();
    result.projects = extractProjects();
    result.certifications = extractCertifications();

    for (const key of ["full_name", "bio", "location", "college", "degree", "field_of_study", "current_company", "current_title"]) {
      if (result[key]) result[key] = cleanText(result[key]);
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Retry wrapper — retries until we have more than just a name, or give up
  // -------------------------------------------------------------------------

  function extractWithRetry(callback, maxRetries, delay) {
    let attempts = 0;

    function attempt() {
      attempts++;
      const profile = extractProfile();
      const hasExtra =
        profile.college || profile.location || profile.current_company || profile.current_title;

      if (hasExtra || attempts >= maxRetries) {
        callback(profile);
      } else {
        setTimeout(attempt, delay);
      }
    }

    attempt();
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function mergeProfiles(base, next) {
    for (const [key, value] of Object.entries(next)) {
      if (["past_companies", "past_titles", "skills", "projects", "certifications"].includes(key)) {
        base[key] = uniqueTexts([
          ...(Array.isArray(base[key]) ? base[key] : []),
          ...(Array.isArray(value) ? value : []),
        ]);
        continue;
      }
      const hasValue = value !== null && value !== undefined && value !== "";
      const shouldReplace = base[key] === null || base[key] === undefined || base[key] === "";
      if (hasValue && (shouldReplace || (key === "currently_studying" && value === true))) {
        base[key] = value;
      }
    }
    return base;
  }

  async function extractAcrossProfile() {
    const originalX = window.scrollX;
    const originalY = window.scrollY;
    let merged = extractProfile();

    try {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      for (const fraction of [0.2, 0.4, 0.6, 0.8, 1]) {
        window.scrollTo(0, maxScroll * fraction);
        await wait(700);
        merged = mergeProfiles(merged, extractProfile());
      }
    } finally {
      window.scrollTo(originalX, originalY);
    }

    return merged;
  }

  // -------------------------------------------------------------------------
  // Message listener (popup → content script)
  // -------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "extract_profile") {
      extractAcrossProfile()
        .then((profile) => {
          console.debug("AlumniSync extracted profile", profile);
          sendResponse({ success: true, profile });
        })
        .catch((err) => sendResponse({ success: false, error: err.message }));
    }
    return true;
  });

  // Warm-up cache after 1.5s (gives React time to render initial content)
  setTimeout(() => {
    try {
      const profile = extractProfile();
      chrome.storage.local.set({ lastProfile: profile, lastProfileUrl: window.location.href });
    } catch (_) {}
  }, 1500);

})();
