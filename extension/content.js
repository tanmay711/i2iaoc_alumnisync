/**
 * AlumniSync — Content Script (v6 — LinkedIn 2025)
 *
 * APPROACH: Parse document.body.innerText (the visible page text).
 *
 * LinkedIn's DOM is unstable (React virtualization, changing class names,
 * no stable IDs on logged-in views). But the VISIBLE TEXT always follows
 * a predictable structure:
 *
 *   Name
 *   Headline
 *   Location · Contact info
 *   ...
 *   Education
 *     School Name
 *     Degree, Field
 *     Date range
 *   ...
 *   Experience
 *     Job Title
 *     Company
 *     Date range
 *
 * We scroll incrementally to force all sections into the DOM, then parse
 * the full page text to extract data from the correct sections.
 */

(function () {
  "use strict";

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // =========================================================================
  // NAME — from <h1> (always at top, never virtualized)
  // =========================================================================

  function extractName() {
    const h1 = document.querySelector("h1");
    if (h1 && h1.innerText.trim().length > 1) return h1.innerText.trim();

    const og = document.querySelector('meta[property="og:title"]');
    if (og) {
      const n = og.getAttribute("content").split(/[|\u2013\u2014]/)[0].trim();
      if (n.length > 1 && !/linkedin/i.test(n)) return n;
    }

    const t = document.title.replace(/^\(\d+\)\s*/, "").split(/[|\u2013\u2014]/)[0].trim();
    if (t.length > 1 && !/linkedin/i.test(t)) return t;

    return null;
  }

  // =========================================================================
  // SCROLL THROUGH PAGE — forces LinkedIn to render all sections
  // =========================================================================

  async function scrollFullPage() {
    // LinkedIn may use a custom scroll container instead of window
    const scrollContainer =
      document.querySelector(".scaffold-layout__main") ||
      document.querySelector("main") ||
      document.scrollingElement ||
      document.documentElement;

    const savedY = scrollContainer.scrollTop || window.scrollY;
    const totalHeight = scrollContainer.scrollHeight || document.documentElement.scrollHeight;
    const viewHeight = window.innerHeight;
    const step = Math.floor(viewHeight * 0.6);

    // Scroll down in steps to force LinkedIn to render each section
    for (let y = 0; y < totalHeight; y += step) {
      scrollContainer.scrollTop = y;
      window.scrollTo({ top: y, behavior: "instant" });
      await sleep(300); // give React time to render
    }

    // Scroll to very bottom
    scrollContainer.scrollTop = totalHeight;
    window.scrollTo({ top: totalHeight, behavior: "instant" });
    await sleep(400);

    // Now scroll back up in steps (so sections near top render again)
    for (let y = totalHeight; y >= 0; y -= step) {
      scrollContainer.scrollTop = y;
      window.scrollTo({ top: y, behavior: "instant" });
      await sleep(200);
    }

    // Restore original position
    scrollContainer.scrollTop = savedY;
    window.scrollTo({ top: savedY, behavior: "instant" });
    await sleep(100);
  }

  // =========================================================================
  // TEXT-BASED SECTION PARSER
  // Splits the full page text into sections by known headings
  // =========================================================================

  function getPageSections() {
    const fullText = (document.querySelector("main") || document.body).innerText;
    const allLines = fullText.split("\n").map((l) => l.trim()).filter(Boolean);

    // Known LinkedIn section headings
    const sectionHeadings = [
      "about", "experience", "education", "licenses & certifications",
      "skills", "recommendations", "courses", "projects", "publications",
      "honors & awards", "languages", "interests", "volunteer experience",
      "organizations", "test scores", "patents", "featured",
    ];

    const sections = {};
    let currentSection = "__top__";
    sections[currentSection] = [];

    for (const line of allLines) {
      const lower = line.toLowerCase();
      // Check if this line is a section heading
      // LinkedIn headings are standalone lines matching exactly
      // Some have counts like "Skills (12)" or "Licenses & certifications (23)"
      const cleanLower = lower.replace(/\s*\(\d+\)\s*$/, "").trim();

      if (sectionHeadings.includes(cleanLower)) {
        currentSection = cleanLower;
        sections[currentSection] = [];
      } else {
        if (!sections[currentSection]) sections[currentSection] = [];
        sections[currentSection].push(line);
      }
    }

    return sections;
  }

  // =========================================================================
  // PARSE EDUCATION from section text lines
  // =========================================================================

  function parseEducation(lines) {
    if (!lines || lines.length === 0) return null;

    // Filter out noise lines (buttons, links, icons, follower counts, etc.)
    const clean = lines.filter((l) =>
      l.length > 1 &&
      l.length < 300 &&
      !/^(show all|see more|see less|show \d|logo|·)$/i.test(l) &&
      !/^\d[\d,]+\s*(followers?|connections?|employees?|members?)/i.test(l) &&
      !/^(followers?|connections?)\s*$/i.test(l) &&
      !/^\d+\+?\s*(followers?|connections?)/i.test(l) &&
      !/^(mutual connections?|people also viewed|more profiles)/i.test(l)
    );

    if (clean.length === 0) return null;

    // The first education entry starts at line 0
    // Structure: School Name → Degree, Field → Date range → (optional extras)

    const college = clean[0] || null;
    let degree = null;
    let field_of_study = null;
    let start_year = null;
    let end_year = null;
    let currently_studying = false;
    let dateFound = false;

    for (let i = 1; i < Math.min(clean.length, 8); i++) {
      const t = clean[i];

      // Skip noise
      if (/^(activities|grade|description|skills)/i.test(t)) break;

      // Date line: contains year numbers
      if (/\b(19|20)\d{2}\b/.test(t) || /present|current/i.test(t)) {
        const yrs = (t.match(/\b(19|20)\d{2}\b/g) || []).map(Number);
        start_year = yrs[0] || null;
        end_year = yrs[1] || null;
        currently_studying = /present|current/i.test(t) && !end_year;
        dateFound = true;
        break; // Stop after date — rest is description
      }

      // If another school name appears (next education entry), stop
      // Heuristic: if this line is longer than 15 chars, has no comma, and no digits — might be next school
      // But first non-date line is likely degree/field
      if (!degree) {
        const parts = t.split(",").map((p) => p.trim());
        degree = parts[0] || null;
        field_of_study = parts.slice(1).join(", ") || null;
      }
    }

    return { college, degree, field_of_study, start_year, end_year, currently_studying };
  }

  // =========================================================================
  // PARSE EXPERIENCE from section text lines
  // =========================================================================

  function parseExperience(lines) {
    if (!lines || lines.length === 0) {
      return { current_title: null, current_company: null, past_titles: null, past_companies: null };
    }

    const clean = lines.filter((l) =>
      l.length > 1 &&
      l.length < 300 &&
      !/^(show all|see more|see less|show \d|logo|·)$/i.test(l) &&
      !/^\d[\d,]+\s*(followers?|connections?|employees?|members?)/i.test(l) &&
      !/^(followers?|connections?)\s*$/i.test(l) &&
      !/^\d+\+?\s*(followers?|connections?)/i.test(l)
    );

    if (clean.length === 0) {
      return { current_title: null, current_company: null, past_titles: null, past_companies: null };
    }

    // Detect if this is a "grouped roles" pattern (multiple roles at same company)
    // LinkedIn groups them as:
    //   Line 0: Company Name (e.g. "UPTIQ" or "Bajaj Life")
    //   Line 1: Total Duration (e.g. "2 yrs 9 mos" or "20 yrs 1 mo")
    //   Line 2: Location (e.g. "Pune District, Maharashtra, India · On-site")
    //   Line 3: First Role Title (e.g. "SDE" or "Vice President - ...")
    //   Line 4: Employment Type / Date range
    //   ...
    //
    // Single role pattern:
    //   Line 0: Job Title
    //   Line 1: Company Name
    //   Line 2: Date range or Employment Type
    //   Line 3: Location

    // Duration pattern: "X yrs Y mos", "X yr Y mo", "X yrs", "X mos", etc.
    const isDuration = (s) => /^\d+\s*(yrs?|mos?|years?|months?)(\s+\d+\s*(yrs?|mos?|years?|months?))?$/i.test(s.trim());

    // Check if line 1 is a duration → grouped roles pattern
    const isGrouped = clean.length >= 3 && isDuration(clean[1]);

    let current_title = null;
    let current_company = null;
    const past_titles = [];
    const past_companies = [];

    if (isGrouped) {
      // GROUPED ROLES: Company is line 0, duration is line 1
      current_company = clean[0];

      // Find the first actual role title — skip duration, location, noise
      for (let i = 2; i < Math.min(clean.length, 10); i++) {
        const t = clean[i];

        // Skip duration lines
        if (isDuration(t)) continue;
        // Skip location lines (contain comma + geographic terms)
        if (t.includes(",") && /india|district|division|state|city|remote|hybrid|on.?site/i.test(t)) continue;
        // Skip employment types
        if (/^(full.time|part.time|contract|freelance|self.employed|internship|seasonal|apprenticeship)/i.test(t)) continue;
        // Skip date lines
        if (/\b(19|20)\d{2}\b/.test(t) || /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(t)) continue;
        // Skip skill/description lines
        if (/^(\*|•|skills|distributed|architected|specialize|professional|working|taking)/i.test(t)) continue;
        if (t.startsWith("◇") || t.startsWith("♦")) continue;

        // This should be the actual job title
        if (!current_title) {
          current_title = t;
        } else {
          // Subsequent role titles at the same company are past titles
          past_titles.push(t);
        }
      }

      // Collect past titles: scan remaining lines for more role titles
      // After the first role block, look for more roles
      let foundFirst = false;
      let roleCount = 0;
      for (let i = 2; i < clean.length; i++) {
        const t = clean[i];

        if (isDuration(t)) continue;
        if (t.includes(",") && /india|district|division|state|city|remote|hybrid|on.?site/i.test(t)) continue;
        if (/^(full.time|part.time|contract|freelance|self.employed|internship|seasonal|apprenticeship)/i.test(t)) continue;
        if (/\b(19|20)\d{2}\b/.test(t) || /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(t)) continue;
        if (/^(\*|•|◇|♦|skills|distributed|architected|specialize|professional|working|taking)/i.test(t)) continue;
        if (t.length > 200) continue; // descriptions

        roleCount++;
        if (roleCount === 1) {
          foundFirst = true; // skip — this is current_title we already captured
        } else if (roleCount <= 6) {
          // Only if not already added
          if (t !== current_title && !past_titles.includes(t)) {
            past_titles.push(t);
          }
        }
      }

    } else {
      // SINGLE ROLE: Line 0 = Title, find company in subsequent lines
      current_title = clean[0];

      for (let i = 1; i < Math.min(clean.length, 6); i++) {
        const t = clean[i];
        // Skip employment types
        if (/^(full.time|part.time|contract|freelance|self.employed|internship|seasonal|apprenticeship)/i.test(t)) continue;
        // Skip date lines
        if (/\b(19|20)\d{2}\b/.test(t) || /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(t)) break;
        // Skip location-like lines
        if (/\b(remote|hybrid|on.?site)\b/i.test(t)) continue;
        // Skip duration lines
        if (isDuration(t)) continue;

        current_company = t;
        break;
      }
    }

    return {
      current_title,
      current_company,
      past_titles: past_titles.join(" | ") || null,
      past_companies: past_companies.join(" | ") || null,
    };
  }

  // =========================================================================
  // PARSE LOCATION from the top section
  // =========================================================================

  function parseLocation(topLines, knownName) {
    if (!topLines || topLines.length === 0) return null;

    // Location is typically 2-4 lines below the name
    // It looks like: "City, State, Country" or "City, Country"
    // Key patterns:
    //   - Contains comma
    //   - Contains geographic terms (India, States, etc.) OR has 2-3 comma-separated short words
    //   - No year numbers
    //   - Not a headline/bio text (which would be longer or have job-related words)

    // Find name position
    let startIdx = 0;
    if (knownName) {
      const idx = topLines.findIndex((l) => l.toLowerCase() === knownName.toLowerCase());
      if (idx >= 0) startIdx = idx + 1;
    }

    // Search within a narrow window after the name
    const searchEnd = Math.min(startIdx + 10, topLines.length);

    for (let i = startIdx; i < searchEnd; i++) {
      const t = topLines[i];

      // Skip very short or very long lines
      if (t.length < 3 || t.length > 60) continue;

      // Must contain a comma
      if (!t.includes(",")) continue;

      // Must NOT contain year numbers
      if (/\d{4}/.test(t)) continue;

      // Geographic validation — the parts should be short (city/state/country names)
      const parts = t.split(",").map((p) => p.trim());
      if (parts.length < 2 || parts.length > 4) continue;

      // Each part should be relatively short (< 30 chars) and not contain job keywords
      const allPartsShort = parts.every((p) => p.length > 0 && p.length < 30);
      if (!allPartsShort) continue;

      // Exclude if it contains common non-location words
      if (/\b(founder|ceo|cto|engineer|developer|analyst|manager|intern|student|building|helping|passionate|experience|data|software|product|design|AI|tech|startup|company|university|institute|iit|nit|bits|college|school)\b/i.test(t)) {
        continue;
      }

      // Positive match: looks like a geographic location
      return t;
    }

    return null;
  }

  // =========================================================================
  // JSON-LD EXTRACTION (supplemental — works on public views)
  // =========================================================================

  function extractFromJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');

    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const entity =
          data["@type"] === "ProfilePage" && data.mainEntity
            ? data.mainEntity
            : data["@type"] === "Person"
            ? data
            : null;

        if (!entity || entity["@type"] !== "Person") continue;

        const alumniOf = entity.alumniOf;
        const college = Array.isArray(alumniOf)
          ? alumniOf[alumniOf.length - 1]?.name || null
          : alumniOf?.name || null;

        const worksFor = entity.worksFor;
        const current_company = Array.isArray(worksFor)
          ? worksFor[0]?.name || null
          : worksFor?.name || null;

        const jobTitle = entity.jobTitle;
        const current_title = Array.isArray(jobTitle)
          ? jobTitle.filter(Boolean)[0] || null
          : jobTitle || null;

        return { full_name: entity.name || null, college, current_company, current_title };
      } catch (_) {}
    }

    return null;
  }

  // =========================================================================
  // MAIN EXTRACTION — scroll + parse text
  // =========================================================================

  async function extractProfileFull() {
    const profile_url = window.location.href.split("?")[0];

    // Step 1: Get name (always available)
    const full_name = extractName();

    // Step 2: Scroll through the page to force all sections to render
    await scrollFullPage();

    // Step 3: Parse the full page text into sections
    const sections = getPageSections();

    // Step 4: Extract from each section
    const edu = parseEducation(sections["education"]);
    const exp = parseExperience(sections["experience"]);
    const location = parseLocation(sections["__top__"], full_name);

    // Step 5: Get JSON-LD as supplemental data
    const jsonLd = extractFromJsonLd();

    // Build the result — section-specific data takes priority
    const result = {
      full_name: full_name || jsonLd?.full_name || null,
      profile_url,
      source: "linkedin-extension",

      // FROM EDUCATION SECTION ONLY
      college: edu?.college || jsonLd?.college || null,
      degree: edu?.degree || null,
      field_of_study: edu?.field_of_study || null,
      start_year: edu?.start_year || null,
      end_year: edu?.end_year || null,
      currently_studying: edu?.currently_studying || false,

      // FROM EXPERIENCE SECTION ONLY
      current_title: exp?.current_title || jsonLd?.current_title || null,
      current_company: exp?.current_company || jsonLd?.current_company || null,
      current_industry: null,
      past_titles: exp?.past_titles || null,
      past_companies: exp?.past_companies || null,

      // FROM TOP SECTION ONLY
      location: location || null,
    };

    return result;
  }

  // Quick non-scroll extraction (for warm-up cache)
  function extractProfileQuick() {
    const full_name = extractName();
    const sections = getPageSections();
    const edu = parseEducation(sections["education"]);
    const exp = parseExperience(sections["experience"]);
    const location = parseLocation(sections["__top__"], full_name);
    const jsonLd = extractFromJsonLd();

    return {
      full_name: full_name || jsonLd?.full_name || null,
      profile_url: window.location.href.split("?")[0],
      source: "linkedin-extension",
      college: edu?.college || jsonLd?.college || null,
      degree: edu?.degree || null,
      field_of_study: edu?.field_of_study || null,
      start_year: edu?.start_year || null,
      end_year: edu?.end_year || null,
      currently_studying: edu?.currently_studying || false,
      current_title: exp?.current_title || jsonLd?.current_title || null,
      current_company: exp?.current_company || jsonLd?.current_company || null,
      current_industry: null,
      past_titles: exp?.past_titles || null,
      past_companies: exp?.past_companies || null,
      location: location || null,
    };
  }

  // =========================================================================
  // MESSAGE LISTENER
  // =========================================================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "extract_profile") {
      extractProfileFull()
        .then((profile) => sendResponse({ success: true, profile }))
        .catch(() => {
          // Fallback: quick extraction without scroll
          try {
            sendResponse({ success: true, profile: extractProfileQuick() });
          } catch (_) {
            sendResponse({
              success: true,
              profile: {
                full_name: extractName(),
                profile_url: window.location.href.split("?")[0],
                source: "linkedin-extension",
              },
            });
          }
        });
    }
    return true;
  });

  // Warm-up cache
  setTimeout(() => {
    try {
      const p = extractProfileQuick();
      chrome.storage.local.set({ lastProfile: p, lastProfileUrl: window.location.href });
    } catch (_) {}
  }, 2000);
})();
