// index.js

const dialog = document.getElementById("dialog-template");
const dropdown = document.getElementById("dropdown");
const scoreInput = document.getElementById("score");
const saveBtn = document.getElementById("saveBtn");

let currentLi = null;
let currentCategory = null;
let currentSlot = null;

let niveaux = null;     // teams per category
let resultats = null;   // saved selections per category/slot

// ---------- helpers ----------
function populateDropdown(values, currentText) {
  dropdown.innerHTML = "";
  if (!Array.isArray(values)) return;

  values.forEach(value => {
    const option = document.createElement("option");
    option.textContent = value;
    option.value = value;
    if (value === currentText) option.selected = true;
    dropdown.appendChild(option);
  });
}

function getSlotKey(li) {
  // Always rely on data-slot; if missing, capture then store it once.
  if (!li.dataset.slot) {
    // The first text node is your placeholder (e.g., "3P2", "GQF1")
    const key = (li.firstChild?.textContent || "").trim();
    li.dataset.slot = key;
  }
  return li.dataset.slot;
}

function applySavedResultsToDOM() {
  // For each <li>, if we have a saved value in resultats.json, show it
  document.querySelectorAll(".container li").forEach(li => {
    const container = li.closest(".container");
    if (!container) return;
    const category = container.dataset.category;
    const slot = getSlotKey(li);

    const saved = resultats?.[category]?.[slot];
    if (saved && typeof saved === "string" && saved.trim() !== "") {
      // Replace placeholder text with saved team name
      li.firstChild.textContent = saved;
    }
  });
}

async function loadData() {
  const [nivRes, resRes] = await Promise.all([
    fetch("/api/niveaux"),
    fetch("/api/resultats"),
  ]);
  niveaux   = await nivRes.json();
  resultats = await resRes.json();

  // Before we replace any text, store each slot key once
  document.querySelectorAll(".container li").forEach(li => getSlotKey(li));

  // Fill placeholders with saved names (if any)
  applySavedResultsToDOM();
}

function attachLiClickHandlers() {
  document.querySelectorAll(".container li").forEach(li => {
    li.addEventListener("click", () => {
      currentLi = li;
      const container = li.closest(".container");
      currentCategory = container?.dataset.category || null;
      currentSlot = getSlotKey(li);

      // current visible text (could be placeholder or saved team)
      const currentText = (li.firstChild?.textContent || "").trim();
      const scoreSpan = li.querySelector(".score");

      // Fill the dropdown from niveaux.json for this category
      const values = niveaux?.[currentCategory] || [];
      populateDropdown(values, currentText);

      // Put existing score (not persisted) into input
      scoreInput.value = scoreSpan ? scoreSpan.textContent.trim() : "";

      dialog.showModal();
    });
  });
}

async function saveSelection({ category, slot, value }) {
  const resp = await fetch("/api/resultats", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, slot, value }),
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => "");
    throw new Error(`Save failed: ${resp.status} ${msg}`);
  }

  // Update local cache so future loads reflect change without refetch
  if (!resultats[category]) resultats[category] = {};
  resultats[category][slot] = value;
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

      // Update the UI after successful save
      currentLi.firstChild.textContent = picked;

      // Score remains a purely visual tweak (not persisted)
      if (scoreSpan) {
        const v = (scoreInput.value ?? "").toString().trim();
        scoreSpan.textContent = v ? ` ${v}` : "";
      }

      dialog.close();
    } catch (err) {
      console.error(err);
      alert("Erreur: impossible d’enregistrer. Vérifie que le serveur Node tourne.");
    }
  });
}

// ---------- round highlight (kept from your logic) ----------
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
