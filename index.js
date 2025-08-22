// index.js  (GitHub Pages + Cloudflare Worker; team + score + terrain + clear)

const dialog = document.getElementById("dialog-template");
const dropdown = document.getElementById("dropdown");
const scoreInput = document.getElementById("score");
const terrainInput = document.getElementById("terrain");
const keyInput = document.getElementById("editKey");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");

let currentLi = null;
let currentCategory = null;
let currentSlot = null;

let niveaux = null;
let resultats = {};

// --- ENV detection ---
const isLocalhost = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
const WORKER_API = "https://cf-worker.wilsuntournament.workers.dev";
const MODE = isLocalhost ? "local-server" : "pages-with-worker";
const STATIC_DATA_DIR = "./data";
let API_BASE = MODE === "local-server" ? "/api" : WORKER_API;

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

// ensure the first child is a text node we can control
function setLiLabel(li, text) {
  let node = li.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE) {
    node = document.createTextNode("");
    li.insertBefore(node, li.firstChild);
  }
  node.textContent = text;
}

function getSlotKey(li) {
  if (!li.dataset.slot) {
    const key = (li.firstChild?.textContent || "").trim();
    li.dataset.slot = key;
  }
  return li.dataset.slot;
}

function ensureAuxSpans() {
  document.querySelectorAll(".container li.team").forEach(li => {
    if (!li.querySelector(".score")) {
      const s = document.createElement("span");
      s.className = "score";
      li.appendChild(s);
    }
    if (!li.querySelector(".terrain")) {
      const t = document.createElement("span");
      t.className = "terrain";
      li.appendChild(t);
    }
  });
}

// old + new shapes supported
function applySavedResultsToDOM() {
  document.querySelectorAll(".container li.team").forEach(li => {
    const container = li.closest(".container");
    if (!container) return;
    const category = container.dataset.category;
    const slot = getSlotKey(li);
    const saved = resultats?.[category]?.[slot];

    const team    = typeof saved === "string" ? saved : saved?.team;
    const score   = typeof saved === "object" ? (saved.score   || "") : "";
    const terrain = typeof saved === "object" ? (saved.terrain || "") : "";

    if (team && team.trim()) setLiLabel(li, team);

    const scoreSpan   = li.querySelector(".score");
    const terrainSpan = li.querySelector(".terrain");
    if (scoreSpan)   scoreSpan.textContent   = score   ? ` ${score}` : "";
    if (terrainSpan) terrainSpan.textContent = terrain || "";
  });
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function loadData() {
  try {
    if (MODE === "local-server") {
      const [niv, res] = await Promise.all([
        fetchJSON(`${API_BASE}/niveaux`),
        fetchJSON(`${API_BASE}/resultats`).catch(() => ({})),
      ]);
      niveaux = niv;
      resultats = res || {};
    } else {
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

  document.querySelectorAll(".container li.team").forEach(li => getSlotKey(li));
  applySavedResultsToDOM();
}

function attachLiClickHandlers() {
  document.querySelectorAll(".container li.team").forEach(li => {
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
      const saved = resultats?.[currentCategory]?.[currentSlot];
      terrainInput.value = (typeof saved === "object" && saved?.terrain) ? saved.terrain : "";

      dialog.showModal();
    });
  });
}

async function saveSelection({ category, slot, value, score, editKey, terrain }) {
  const resp = await fetch(`${API_BASE}/resultats`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Edit-Key": editKey || ""
    },
    body: JSON.stringify({ category, slot, value, score, terrain }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Save failed: ${resp.status} ${t}`);
  }

  if (!resultats[category]) resultats[category] = {};
  resultats[category][slot] = {
    team: (value ?? "").toString().trim(),
    score: (score ?? "").toString().trim(),
    terrain: (terrain ?? "").toString().trim(),
  };
}

function attachSaveHandler() {
  if (!saveBtn) return;
  saveBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!currentLi || !currentCategory || !currentSlot) { dialog.close(); return; }

    const picked      = dropdown.value;
    const scoreSpan   = currentLi.querySelector(".score");
    const terrainSpan = currentLi.querySelector(".terrain");
    const scoreVal    = (scoreInput.value ?? "").toString().trim();
    const terrainVal  = (terrainInput?.value ?? "").toString().trim();
    const editKey     = (keyInput?.value ?? "").trim();

    if (!editKey) { alert("Enter the editor key to save."); return; }

    try {
      await saveSelection({
        category: currentCategory,
        slot: currentSlot,
        value: picked,
        score: scoreVal,
        terrain: terrainVal,
        editKey
      });

      setLiLabel(currentLi, picked);
      if (scoreSpan)   scoreSpan.textContent   = scoreVal   ? ` ${scoreVal}` : "";
      if (terrainSpan) terrainSpan.textContent = terrainVal || "";

      if (keyInput) keyInput.value = "";
      dialog.close();
    } catch (err) {
      console.error(err);
      alert("Save blocked (bad key or server error).");
    }
  });
}

async function clearSelection({ category, slot, editKey }) {
  const resp = await fetch(`${API_BASE}/resultats`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Edit-Key": editKey || ""
    },
    body: JSON.stringify({ category, slot, clear: true }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Clear failed: ${resp.status} ${t}`);
  }

  if (resultats[category]) {
    delete resultats[category][slot];
    if (Object.keys(resultats[category]).length === 0) delete resultats[category];
  }
}

function attachClearHandler() {
  if (!clearBtn) return;
  clearBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!currentLi || !currentCategory || !currentSlot) return;

    const editKey = (keyInput?.value ?? "").trim();
    if (!editKey) { alert("Enter the editor key to clear."); return; }

    try {
      await clearSelection({ category: currentCategory, slot: currentSlot, editKey });

      setLiLabel(currentLi, "");
      const scoreSpan   = currentLi.querySelector(".score");
      const terrainSpan = currentLi.querySelector(".terrain");
      if (scoreSpan)   scoreSpan.textContent   = "";
      if (terrainSpan) terrainSpan.textContent = "";

      if (keyInput) keyInput.value = "";
      if (scoreInput) scoreInput.value = "";
      if (terrainInput) terrainInput.value = "";
      dialog.close();
    } catch (err) {
      console.error(err);
      alert("Clear blocked (bad key or server error).");
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  ensureAuxSpans();
  await loadData();
  attachLiClickHandlers();
  attachSaveHandler();
  attachClearHandler();
});
