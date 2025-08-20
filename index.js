// index.js  (dual-mode for Node server + GitHub Pages + score persistence)

const dialog = document.getElementById("dialog-template");
const dropdown = document.getElementById("dropdown");
const scoreInput = document.getElementById("score");
const saveBtn = document.getElementById("saveBtn");
const keyInput = document.getElementById("editKey");          // <-- NEW

let currentLi = null;
let currentCategory = null;
let currentSlot = null;

let niveaux = null;     // teams per category
let resultats = {};     // saved selections per category/slot

// --- ENV detection ---
// Localhost => Node server (/api)
// GitHub Pages => Cloudflare Worker for resultats, static for niveaux
const isLocalhost = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);

// IMPORTANT: remove the leading space you had before
const WORKER_API = "https://cf-worker.wilsuntournament.workers.dev";

const MODE = isLocalhost ? "local-server" : "pages-with-worker";
const STATIC_DATA_DIR = "./data";  // niveaux shipped in repo (read-only)
let API_BASE = MODE === "local-server" ? "/api" : WORKER_API;

const STORAGE_KEY = "resultats_local_v1"; // only used if you ever re-enable static fallback

// ---------- helpers ----------
function populateDropdown(values, currentText) {
  dropdown.innerHTML = "";
  (values || []).forEach(value => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    if (value === currentText) opt.selected = true;
    dropdown.appendChild(opt);
  });
}

function getSlotKey(li) {
  if (!li.dataset.slot) {
    const key = (li.firstChild?.textContent || "").trim();
    li.dataset.slot = key;
  }
  return li.dataset.slot;
}

// Handle BOTH shapes in resultats:
// - old: resultats[cat][slot] = "Team Name"
// - new: resultats[cat][slot] = { team: "Team Name", score: "15" }
function applySavedResultsToDOM() {
  document.querySelectorAll(".container li").forEach(li => {
    const container = li.closest(".container");
    if (!container) return;
    const category = container.dataset.category;
    const slot = getSlotKey(li);
    const saved = resultats?.[category]?.[slot];

    const team  = typeof saved === "string" ? saved : saved?.team;
    const score = typeof saved === "object" ? (saved.score || "") : "";

    if (team && team.trim()) {
      li.firstChild.textContent = team;
    }
    const scoreSpan = li.querySelector(".score");
    if (scoreSpan) scoreSpan.textContent = score ? ` ${score}` : "";
  });
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function deepMerge(base, add) {
  if (!add) return base || {};
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(add)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function loadData() {
  try {
    if (MODE === "local-server") {
      // Node server: both via API
      const [niv, res] = await Promise.all([
        fetchJSON(`${API_BASE}/niveaux`),
        fetchJSON(`${API_BASE}/resultats`).catch(() => ({})),
      ]);
      niveaux = niv;
      resultats = res || {};
    } else {
      // GitHub Pages + Worker:
      // niveaux from static repo, resultats from Worker API
      const [niv, res] = await Promise.all([
        fetchJSON(`${STATIC_DATA_DIR}/niveaux.json`),
        fetchJSON(`${API_BASE}/resultats`).catch(() => ({})),
      ]);
      niveaux = niv;
      resultats = res || {};
    }
  } catch (e) {
    console.error("loadData error:", e);
    niveaux = niveaux || {};
    resultats = resultats || {};
  }

  document.querySelectorAll(".container li").forEach(li => getSlotKey(li));
  applySavedResultsToDOM();
}

function attachLiClickHandlers() {
  document.querySelectorAll(".container li").forEach(li => {
    li.addEventListener("click", () => {
      currentLi = li;
      const container = li.closest(".container");
      currentCategory = container?.dataset.category || null;
      currentSlot = getSlotKey(li);

      const currentText = (li.firstChild?.textContent || "").trim();
      const scoreSpan = li.querySelector(".score");

      const values = niveaux?.[currentCategory] || [];
      populateDropdown(values, currentText);

      scoreInput.value = scoreSpan ? scoreSpan.textContent.trim() : "";
      dialog.showModal();
    });
  });
}

async function saveSelection({ category, slot, value, score, editKey }) { // <-- CHANGED
  // Always use API_BASE (either local /api or Worker)
  const resp = await fetch(`${API_BASE}/resultats`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Edit-Key": editKey || ""                               // <-- NEW
    },
    body: JSON.stringify({ category, slot, value, score }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Save failed: ${resp.status} ${t}`);
  }

  // Keep local cache in sync with the NEW object shape
  if (!resultats[category]) resultats[category] = {};
  resultats[category][slot] = {
    team: value,
    ...(score && score.trim() ? { score: score.trim() } : {})
  };
}

function attachSaveHandler() {
  saveBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!currentLi || !currentCategory || !currentSlot) {
      dialog.close();
      return;
    }

    const picked   = dropdown.value;
    const scoreSpan = currentLi.querySelector(".score");
    const scoreVal  = (scoreInput.value ?? "").toString().trim();
    const editKey   = (keyInput?.value ?? "").trim();           // <-- NEW

    if (!editKey) {                                             // <-- NEW
      alert("Enter the editor key to save.");
      return;
    }

    try {
      await saveSelection({
        category: currentCategory,
        slot: currentSlot,
        value: picked,
        score: scoreVal,
        editKey                                             // <-- NEW
      });

      // Update UI immediately
      currentLi.firstChild.textContent = picked;
      if (scoreSpan) scoreSpan.textContent = scoreVal ? ` ${scoreVal}` : "";

      if (keyInput) keyInput.value = "";                      // optional: clear key
      dialog.close();
    } catch (err) {
      console.error(err);
      alert("Save blocked (bad key or server error).");
    }
  });
}

// ---------- round highlight (unchanged) ----------
(function () {
  function applyHighlight(radio) {
    const round = radio.closest('.round');
    if (!round) return;
    const container = round.closest('.container');
    if (!container) return;

    container.querySelectorAll('ul.matchup.current')
      .forEach(ul => ul.classList.remove('current'));

    round.querySelectorAll('ul.matchup')
      .forEach(ul => ul.classList.add('current'));
  }

  document.addEventListener('change', (e) => {
    if (e.target.matches('.round-details input[type="radio"]')) {
      applyHighlight(e.target);
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.container').forEach((container, i) => {
      const radios = container.querySelectorAll('.round-details input[type="radio"]');
      radios.forEach(r => r.name = `current-group-${i}`);

      container.querySelectorAll('ul.matchup.current')
        .forEach(ul => ul.classList.remove('current'));

      let defaultRadio = container.querySelector('.round-details input[type="radio"]:checked') || radios[0];
      if (defaultRadio) {
        defaultRadio.checked = true;
        applyHighlight(defaultRadio);
      }
    });
  });
})();

// ---------- boot ----------
document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  attachLiClickHandlers();
  attachSaveHandler();
});
