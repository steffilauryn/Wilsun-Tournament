// index.js  (dual-mode for Node server + GitHub Pages)

const dialog = document.getElementById("dialog-template");
const dropdown = document.getElementById("dropdown");
const scoreInput = document.getElementById("score");
const saveBtn = document.getElementById("saveBtn");

let currentLi = null;
let currentCategory = null;
let currentSlot = null;

let niveaux = null;     // teams per category
let resultats = {};     // saved selections per category/slot

// --- ENV detection ---
// Localhost => Node server (/api)
// GitHub Pages => use Cloudflare Worker for resultats, static for niveaux
const isLocalhost = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);

// 1) CHANGE THIS to your actual worker URL:
const WORKER_API = "https://bracket-api.<your-subdomain>.workers.dev";

// 2) If you use a custom domain for Pages, this still works (origin check is on the Worker).
const MODE = isLocalhost ? "local-server" : "pages-with-worker";

const STATIC_DATA_DIR = "./data";  // niveaux/resultats shipped in repo (read-only)
let API_BASE = null;               // will be set below

if (MODE === "local-server") {
  API_BASE = "/api";               // your Express server from earlier
} else {
  API_BASE = WORKER_API;           // Cloudflare Worker
}


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

function applySavedResultsToDOM() {
  document.querySelectorAll(".container li").forEach(li => {
    const container = li.closest(".container");
    if (!container) return;
    const category = container.dataset.category;
    const slot = getSlotKey(li);
    const saved = resultats?.[category]?.[slot];
    if (typeof saved === "string" && saved.trim()) {
      li.firstChild.textContent = saved;
    }
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

async function saveSelection({ category, slot, value }) {
  if (API_BASE) {
    // Server mode: write to disk
    const resp = await fetch(`${API_BASE}/resultats`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, slot, value }),
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`Save failed: ${resp.status} ${t}`);
    }
    // keep local cache in sync
    if (!resultats[category]) resultats[category] = {};
    resultats[category][slot] = value;
  } else {
    // Static mode: save to localStorage (per-user)
    if (!resultats[category]) resultats[category] = {};
    resultats[category][slot] = value;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ data: resultats, _version: 1 })
    );
    // Optional toast
    console.info("[Static mode] Saved locally to localStorage.");
  }
}

function attachSaveHandler() {
  saveBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!currentLi || !currentCategory || !currentSlot) {
      dialog.close();
      return;
    }

    const picked = dropdown.value;
    const scoreSpan = currentLi.querySelector(".score");

    try {
      await saveSelection({
        category: currentCategory,
        slot: currentSlot,
        value: picked
      });

      // Update UI
      currentLi.firstChild.textContent = picked;
      if (scoreSpan) {
        const v = (scoreInput.value ?? "").toString().trim();
        scoreSpan.textContent = v ? ` ${v}` : "";
      }

      dialog.close();
    } catch (err) {
      console.error(err);
      alert(
        API_BASE
          ? "Erreur: impossible d’enregistrer (serveur)."
          : "En mode GitHub Pages: sauvegarde locale seulement (localStorage)."
      );
    }
  });
}

// ---------- optional: export merged resultats in static mode ----------
function addExportButton() {
  // small floating button in the corner
  const btn = document.createElement("button");
  btn.textContent = "Export resultats.json";
  Object.assign(btn.style, {
    position: "fixed",
    right: "12px",
    bottom: "12px",
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid #ccc",
    background: "#fff",
    cursor: "pointer",
    zIndex: 9999
  });
  btn.addEventListener("click", () => {
    const blob = new Blob(
      [JSON.stringify(resultats, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "resultats.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
  document.body.appendChild(btn);
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
