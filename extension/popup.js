/**
 * AlumniSync — Popup Script (v3)
 */

"use strict";

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

const STATES = ["not-linkedin", "ready", "syncing", "result", "error"];

function showState(name) {
  STATES.forEach((s) => {
    const el = document.getElementById(`state-${s}`);
    if (el) el.classList.toggle("hidden", s !== name);
  });
}

// ---------------------------------------------------------------------------
// API Status badge
// ---------------------------------------------------------------------------

function setApiStatus(status) {
  const badge = document.getElementById("api-status");
  badge.className = "api-badge";
  if (status === "online") {
    badge.classList.add("api-online");
    badge.textContent = "● API Online";
  } else if (status === "offline") {
    badge.classList.add("api-offline");
    badge.textContent = "✕ API Offline";
  } else {
    badge.classList.add("api-checking");
    badge.textContent = "Connecting…";
  }
}

// ---------------------------------------------------------------------------
// Tab helpers
// ---------------------------------------------------------------------------

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isLinkedInProfile(url) {
  // Match any LinkedIn /in/ profile page regardless of subdomain or params
  return url && /linkedin\.com\/in\//i.test(url);
}

// Extract a best-guess name from the page title stored in tab.title
function nameFromTabTitle(title) {
  if (!title) return null;
  // Tab title format: "(1) Satyamurthy Nageswaran | LinkedIn" or "Name | LinkedIn"
  const clean = title.replace(/^\(\d+\)\s*/, "").split(/[|\u2013\u2014]/)[0].trim();
  return clean.length > 1 && !/linkedin/i.test(clean) ? clean : null;
}

// ---------------------------------------------------------------------------
// Render profile preview
// ---------------------------------------------------------------------------

function renderProfile(profile) {
  const nameEl = document.getElementById("profile-name");
  const subEl = document.getElementById("profile-sub");
  const initialsEl = document.getElementById("profile-initials");
  const collegeEl = document.getElementById("profile-college");
  const yearsEl = document.getElementById("profile-years");
  const locationEl = document.getElementById("profile-location");

  const name = profile.full_name || "Unknown";
  nameEl.textContent = name;

  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
  initialsEl.textContent = initials || "?";

  const parts = [profile.current_title, profile.current_company].filter(Boolean);
  subEl.textContent = parts.length ? parts.join(" @ ") : "—";

  collegeEl.textContent = profile.college || "—";
  const years = [profile.start_year, profile.end_year].filter(Boolean).join(" – ");
  yearsEl.textContent = years || "—";
  locationEl.textContent = profile.location || "—";
}

// ---------------------------------------------------------------------------
// Show sync result
// ---------------------------------------------------------------------------

function renderResult(result) {
  const iconEl = document.getElementById("result-icon");
  const titleEl = document.getElementById("result-title");
  const descEl = document.getElementById("result-desc");

  const status = result.status;
  const id = result.alumni_id ? ` (ID #${result.alumni_id})` : "";

  const CONFIG = {
    created: {
      icon: "✅",
      title: "Profile Saved!",
      desc: `Successfully added to AlumniSync${id}. Check the dashboard to view it.`,
    },
    duplicate: {
      icon: "⚠️",
      title: "Already Exists",
      desc: `This person already exists. Matched: "${result.match?.full_name || "—"}" (Score: ${result.match?.identity_score ?? "—"}/100).`,
    },
    needs_review: {
      icon: "🔄",
      title: "Saved — Needs Review",
      desc: `Profile saved${id} but flagged for review: ${result.reason || "Some details are missing."}`,
    },
    excluded: {
      icon: "🚫",
      title: "Not Eligible",
      desc: result.reason || "This person does not qualify as alumni (e.g. currently studying).",
    },
  };

  const cfg = CONFIG[status] || {
    icon: "❓",
    title: `Status: ${status}`,
    desc: result.reason || JSON.stringify(result),
  };

  iconEl.textContent = cfg.icon;
  titleEl.textContent = cfg.title;
  descEl.textContent = cfg.desc;
}

// ---------------------------------------------------------------------------
// Extract profile from the active tab
// Injects content.js if needed, then requests extraction.
// Always calls callback(profile) — never leaves it hanging.
// ---------------------------------------------------------------------------

function extractFromTab(tab, callback) {
  // Step 1: Try sending message to already-injected content script
  chrome.tabs.sendMessage(tab.id, { action: "extract_profile" }, (res) => {
    const err = chrome.runtime.lastError; // consume to suppress console error

    if (!err && res?.success && res.profile?.full_name) {
      // Content script responded with a valid profile
      callback(res.profile);
      return;
    }

    // Step 2: Content script not injected (or returned bad data) — inject now
    chrome.scripting.executeScript(
      { target: { tabId: tab.id }, files: ["content.js"] },
      () => {
        if (chrome.runtime.lastError) {
          // Script injection failed — fall back to name-only profile from tab title
          callback({ full_name: nameFromTabTitle(tab.title), profile_url: tab.url, source: "linkedin-extension" });
          return;
        }

        // Wait for the script to initialise its listener, then ask for extraction
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, { action: "extract_profile" }, (res2) => {
            const err2 = chrome.runtime.lastError;

            if (!err2 && res2?.success && res2.profile) {
              callback(res2.profile);
            } else {
              // Extraction failed — return a minimal profile using the tab title
              // The user can still sync with just the name; the ingestion pipeline
              // will save it as "Needs Review"
              callback({ full_name: nameFromTabTitle(tab.title), profile_url: tab.url, source: "linkedin-extension" });
            }
          });
        }, 800);
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Main init
// ---------------------------------------------------------------------------

let currentProfile = null;
let currentTab = null;

async function init() {
  // Check API health (non-blocking)
  chrome.runtime.sendMessage({ action: "check_api" }, (res) => {
    setApiStatus(res?.online ? "online" : "offline");
  });

  currentTab = await getCurrentTab();

  // Not on a LinkedIn profile page
  if (!isLinkedInProfile(currentTab?.url)) {
    showState("not-linkedin");
    return;
  }

  // Show "ready" shell immediately with "Extracting…" placeholder
  showState("ready");
  document.getElementById("profile-name").textContent = "Extracting profile…";
  document.getElementById("profile-initials").textContent = "…";
  document.getElementById("btn-sync").disabled = true;

  // Extract fresh data from the page
  extractFromTab(currentTab, (profile) => {
    currentProfile = profile;
    renderProfile(profile);
    document.getElementById("btn-sync").disabled = false;

    // If extraction only gave us the name (missing details),
    // show a small hint that data may be incomplete
    if (!profile.college && !profile.location && !profile.current_company) {
      document.getElementById("profile-sub").textContent = "⚠ Scroll down on the profile to load all details, then reopen this popup.";
    }
  });
}

// ---------------------------------------------------------------------------
// Sync button
// ---------------------------------------------------------------------------

document.getElementById("btn-sync").addEventListener("click", () => {
  if (!currentProfile) return;

  if (!currentProfile.full_name || currentProfile.full_name.trim() === "") {
    document.getElementById("error-title").textContent = "Name Not Found";
    document.getElementById("error-desc").textContent =
      "Could not extract the person's name. Please refresh the LinkedIn page and try again.";
    document.getElementById("error-hint").style.display = "none";
    showState("error");
    return;
  }

  showState("syncing");

  chrome.runtime.sendMessage(
    { action: "sync_profile", profile: currentProfile },
    (res) => {
      if (chrome.runtime.lastError || !res || !res.success) {
        let errMsg = res?.error || "Unknown error.";
        // Parse Pydantic 422 validation errors into readable form
        try {
          const jsonStart = errMsg.indexOf("{");
          if (jsonStart !== -1) {
            const parsed = JSON.parse(errMsg.substring(jsonStart));
            if (parsed?.detail && Array.isArray(parsed.detail)) {
              errMsg = parsed.detail
                .map((d) => `• ${d.loc?.slice(-1)[0] || "field"}: ${d.msg}`)
                .join("\n");
            }
          }
        } catch (_) {}

        document.getElementById("error-title").textContent = "Sync Failed";
        document.getElementById("error-desc").textContent = errMsg;
        document.getElementById("error-hint").style.display = "none";
        showState("error");
        return;
      }

      renderResult(res.result);
      showState("result");
    }
  );
});

// ---------------------------------------------------------------------------
// "Sync Another" → go back to ready state
// ---------------------------------------------------------------------------

document.getElementById("btn-sync-another").addEventListener("click", () => {
  showState("ready");
});

// ---------------------------------------------------------------------------
// Retry — re-run init
// ---------------------------------------------------------------------------

document.getElementById("btn-retry").addEventListener("click", () => {
  init();
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

init();
