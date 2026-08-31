/**
 * AlumniSync Dashboard — Application Logic
 */

"use strict";

const API = "http://localhost:8000";
const PAGE_SIZE = 20;

let allAlumni = [];
let filteredAlumni = [];
let currentPage = 1;
let deleteTargetId = null;

// ============================================================================
// NAVIGATION
// ============================================================================

document.querySelectorAll(".nav-item").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const target = link.dataset.section;
    navigate(target);
  });
});

function navigate(section) {
  document.querySelectorAll(".nav-item").forEach((l) => l.classList.remove("active"));
  document.querySelector(`[data-section="${section}"]`)?.classList.add("active");

  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  document.getElementById(`section-${section}`)?.classList.add("active");

  if (section === "analytics") renderAnalytics();
}

// ============================================================================
// API STATUS
// ============================================================================

async function checkApiStatus() {
  const dot = document.getElementById("api-dot");
  const label = document.getElementById("api-label");

  try {
    const res = await fetch(`${API}/health`);
    if (res.ok) {
      dot.className = "api-dot dot-online";
      label.textContent = "API Online";
    } else {
      throw new Error();
    }
  } catch {
    dot.className = "api-dot dot-offline";
    label.textContent = "API Offline";
  }
}

// ============================================================================
// LOAD ALUMNI
// ============================================================================

async function loadAlumni() {
  try {
    const res = await fetch(`${API}/alumni/?limit=500`);
    if (!res.ok) throw new Error("Failed to load alumni");
    const data = await res.json();
    allAlumni = data.results || data; // handle both paginated and flat response
    applySearchFilter();
    updateStats();
  } catch (err) {
    showTableMsg("⚠️ Could not load alumni. Is the backend running?");
    console.error(err);
  }
}

// ============================================================================
// SEARCH / FILTER
// ============================================================================

const searchInput = document.getElementById("search-input");

searchInput.addEventListener("input", () => {
  currentPage = 1;
  applySearchFilter();
});

function applySearchFilter() {
  const q = searchInput.value.trim().toLowerCase();

  if (!q) {
    filteredAlumni = [...allAlumni];
  } else {
    filteredAlumni = allAlumni.filter((a) =>
      [a.full_name, a.college, a.current_company, a.location, a.field_of_study, a.current_title]
        .some((v) => v && v.toLowerCase().includes(q))
    );
  }

  renderTable();
  updatePagination();
}

// ============================================================================
// RENDER TABLE
// ============================================================================

function renderTable() {
  const tbody = document.getElementById("alumni-tbody");

  if (!filteredAlumni.length) {
    showTableMsg("No alumni found.");
    return;
  }

  const start = (currentPage - 1) * PAGE_SIZE;
  const page = filteredAlumni.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = page
    .map((a) => {
      const badge = statusBadge(a.verification_status);
      const nameEl = a.profile_url
        ? `<a href="${a.profile_url}" target="_blank" class="alumni-name">${esc(a.full_name)}</a>`
        : `<span class="alumni-name">${esc(a.full_name)}</span>`;

      return `<tr>
        <td>${a.id}</td>
        <td>${nameEl}</td>
        <td>${esc(a.college)}</td>
        <td>${esc(a.field_of_study)}</td>
        <td>${a.end_year || "—"}</td>
        <td>${esc(a.current_company)}</td>
        <td>${esc(a.current_title)}</td>
        <td>${esc(a.location)}</td>
        <td>${badge}</td>
        <td>
          <button class="action-btn" title="Delete" onclick="confirmDelete(${a.id}, '${esc(a.full_name)}')">🗑</button>
        </td>
      </tr>`;
    })
    .join("");
}

function showTableMsg(msg) {
  document.getElementById("alumni-tbody").innerHTML =
    `<tr><td colspan="10" class="empty-msg">${msg}</td></tr>`;
}

function statusBadge(status) {
  const map = {
    "Eligible Alumni": "badge-verified",
    "Needs Review": "badge-review",
    "Current Student": "badge-pending",
  };
  const cls = map[status] || "badge-default";
  return `<span class="badge ${cls}">${status || "—"}</span>`;
}

function esc(str) {
  if (!str) return "—";
  return str.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ============================================================================
// PAGINATION
// ============================================================================

function updatePagination() {
  const total = filteredAlumni.length;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  document.getElementById("page-info").textContent =
    `Page ${currentPage} of ${totalPages} (${total} records)`;
  document.getElementById("btn-prev").disabled = currentPage <= 1;
  document.getElementById("btn-next").disabled = currentPage >= totalPages;
}

document.getElementById("btn-prev").addEventListener("click", () => {
  if (currentPage > 1) { currentPage--; renderTable(); updatePagination(); }
});

document.getElementById("btn-next").addEventListener("click", () => {
  const totalPages = Math.ceil(filteredAlumni.length / PAGE_SIZE) || 1;
  if (currentPage < totalPages) { currentPage++; renderTable(); updatePagination(); }
});

// ============================================================================
// STATS
// ============================================================================

function updateStats() {
  document.getElementById("stat-total").textContent = allAlumni.length;

  const verified = allAlumni.filter(
    (a) => a.verification_status === "Eligible Alumni"
  ).length;
  document.getElementById("stat-verified").textContent = verified;

  const review = allAlumni.filter(
    (a) => a.verification_status === "Needs Review"
  ).length;
  document.getElementById("stat-review").textContent = review;

  const companies = new Set(allAlumni.map((a) => a.current_company).filter(Boolean));
  document.getElementById("stat-companies").textContent = companies.size;
}

// ============================================================================
// REFRESH
// ============================================================================

document.getElementById("btn-refresh").addEventListener("click", loadAlumni);

// ============================================================================
// EXPORT CSV
// ============================================================================

document.getElementById("btn-export").addEventListener("click", () => {
  const q = searchInput.value.trim();
  const url = q ? `${API}/alumni/export?q=${encodeURIComponent(q)}` : `${API}/alumni/export`;
  window.open(url, "_blank");
});

// ============================================================================
// ADD ALUMNI FORM
// ============================================================================

document.getElementById("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const resultEl = document.getElementById("add-result");
  const form = e.target;
  const fd = new FormData(form);

  const data = {};
  fd.forEach((v, k) => { data[k] = v || null; });

  // Coerce types
  if (data.start_year) data.start_year = parseInt(data.start_year, 10);
  if (data.end_year)   data.end_year   = parseInt(data.end_year, 10);
  data.currently_studying = form.querySelector('[name="currently_studying"]').checked;

  // Remove null values
  Object.keys(data).forEach((k) => { if (data[k] === null || data[k] === "") delete data[k]; });

  try {
    const res = await fetch(`${API}/alumni/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const result = await res.json();

    if (!res.ok) {
      showAlert(resultEl, "error", "API Error: " + JSON.stringify(result));
      return;
    }

    const statusMsgs = {
      created: { cls: "success", msg: `✅ Alumni saved! ID: #${result.alumni_id}` },
      duplicate: { cls: "warning", msg: `⚠️ Duplicate: "${result.match?.full_name}" already exists (score: ${result.match?.identity_score}/100).` },
      needs_review: { cls: "warning", msg: `🔄 Needs Review: ${result.reason}` },
      excluded: { cls: "error", msg: `🚫 Not eligible: ${result.reason}` },
    };

    const cfg = statusMsgs[result.status] || { cls: "info", msg: JSON.stringify(result) };
    showAlert(resultEl, cfg.cls, cfg.msg);

    if (result.status === "created") {
      form.reset();
      await loadAlumni();
    }
  } catch (err) {
    showAlert(resultEl, "error", "Connection error: " + err.message);
  }
});

function showAlert(el, type, msg) {
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 6000);
}

// ============================================================================
// DELETE ALUMNI
// ============================================================================

function confirmDelete(id, name) {
  deleteTargetId = id;
  document.getElementById("modal-msg").textContent =
    `Delete "${name}" (ID #${id}) from the database? This cannot be undone.`;
  document.getElementById("modal-overlay").classList.remove("hidden");
}

document.getElementById("modal-cancel").addEventListener("click", () => {
  document.getElementById("modal-overlay").classList.add("hidden");
  deleteTargetId = null;
});

document.getElementById("modal-confirm").addEventListener("click", async () => {
  if (!deleteTargetId) return;

  try {
    const res = await fetch(`${API}/alumni/${deleteTargetId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed");
    document.getElementById("modal-overlay").classList.add("hidden");
    deleteTargetId = null;
    await loadAlumni();
  } catch (err) {
    alert("Error deleting alumni: " + err.message);
  }
});

// ============================================================================
// CSV IMPORT
// ============================================================================

const fileInput = document.getElementById("csv-file-input");
const importBtn = document.getElementById("btn-import");
const csvInfo   = document.getElementById("csv-info");
const uploadZone = document.getElementById("upload-zone");

// Drag-and-drop styling
uploadZone.addEventListener("dragover", (e) => { e.preventDefault(); uploadZone.classList.add("dragover"); });
uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("dragover"));
uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) { fileInput.files = e.dataTransfer.files; handleFileSelected(file); }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) handleFileSelected(fileInput.files[0]);
});

function handleFileSelected(file) {
  csvInfo.textContent = `📄 Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  importBtn.disabled = false;
}

importBtn.addEventListener("click", async () => {
  const file = fileInput.files[0];
  if (!file) return;

  importBtn.disabled = true;
  importBtn.textContent = "Uploading…";

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(`${API}/alumni/import-csv`, {
      method: "POST",
      body: formData,
    });

    const result = await res.json();

    if (!res.ok) throw new Error(JSON.stringify(result));

    renderImportResult(result);
    await loadAlumni();
  } catch (err) {
    document.getElementById("csv-info").textContent = "❌ Error: " + err.message;
  } finally {
    importBtn.disabled = false;
    importBtn.textContent = "⬆ Upload & Import";
  }
});

function renderImportResult(result) {
  const container = document.getElementById("import-result");
  const summary = document.getElementById("import-summary");
  const s = result.summary;

  summary.innerHTML = [
    { num: s.created,      label: "Created",      color: "#16a34a" },
    { num: s.duplicate,    label: "Duplicates",   color: "#d97706" },
    { num: s.needs_review, label: "Review",       color: "#2563eb" },
    { num: s.excluded,     label: "Excluded",     color: "#6b7280" },
    { num: s.errors,       label: "Errors",       color: "#dc2626" },
  ]
    .map(
      (item) =>
        `<div class="summary-item">
          <div class="summary-num" style="color:${item.color}">${item.num}</div>
          <div class="summary-label">${item.label}</div>
        </div>`
    )
    .join("");

  container.classList.remove("hidden");
}

// Download CSV template
document.getElementById("btn-download-template").addEventListener("click", (e) => {
  e.preventDefault();
  const headers = "full_name,college,field_of_study,degree,start_year,end_year,current_company,current_title,location,profile_url,currently_studying\n";
  const example = "Rahul Patil,VIT Pune,Computer Engineering,B.Tech,2021,2025,Google,Software Engineer,Bangalore,https://linkedin.com/in/example,false\n";
  const blob = new Blob([headers + example], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "alumni_template.csv"; a.click();
  URL.revokeObjectURL(url);
});

// ============================================================================
// ANALYTICS
// ============================================================================

document.getElementById("btn-analytics-refresh").addEventListener("click", renderAnalytics);

function renderAnalytics() {
  if (!allAlumni.length) return;

  renderBarChart("chart-colleges", countBy(allAlumni, "college"));
  renderBarChart("chart-companies", countBy(allAlumni, "current_company"));
  renderBarChart("chart-years", countBy(allAlumni, "end_year"));
  renderBarChart("chart-locations", countBy(allAlumni, "location"));
}

function countBy(data, field) {
  const counts = {};
  data.forEach((a) => {
    const v = a[field];
    if (v) counts[v] = (counts[v] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
}

function renderBarChart(containerId, data) {
  const container = document.getElementById(containerId);
  if (!data.length) { container.innerHTML = '<p style="color:#9ca3af;font-size:12px">No data</p>'; return; }

  const max = data[0][1];

  container.innerHTML = data
    .map(([label, count]) => {
      const pct = Math.round((count / max) * 100);
      return `<div class="bar-row">
        <span class="bar-label" title="${label}">${label}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <span class="bar-count">${count}</span>
      </div>`;
    })
    .join("");
}

// ============================================================================
// BOOT
// ============================================================================

(async function init() {
  checkApiStatus();
  setInterval(checkApiStatus, 30000);
  await loadAlumni();
})();
