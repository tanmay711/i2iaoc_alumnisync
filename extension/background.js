/**
 * AlumniSync — Background Service Worker
 *
 * Handles communication between the popup and the AlumniSync backend API.
 */

const API_BASE = "http://localhost:8000";

// -------------------------------------------------------------------------
// Listen for messages from the popup
// -------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === "sync_profile") {
    syncProfile(message.profile)
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));

    return true; // async response
  }

  if (message.action === "check_api") {
    checkApiHealth()
      .then((ok) => sendResponse({ online: ok }))
      .catch(() => sendResponse({ online: false }));

    return true;
  }
});

// -------------------------------------------------------------------------
// Send profile to backend /alumni/ingest
// -------------------------------------------------------------------------

async function syncProfile(profile) {
  const response = await fetch(`${API_BASE}/alumni/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  const result = await response.json();

  // Persist the last sync result for the popup
  await chrome.storage.local.set({
    lastSyncResult: result,
    lastSyncTime: new Date().toISOString(),
    lastSyncProfile: profile.full_name,
  });

  return result;
}

// -------------------------------------------------------------------------
// Health check
// -------------------------------------------------------------------------

async function checkApiHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
