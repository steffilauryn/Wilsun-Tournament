const dialog = document.getElementById("dialog-template");
const dropdown = document.getElementById("dropdown");
const scoreInput = document.getElementById("score");
const saveBtn = document.getElementById("saveBtn");

let currentLi = null;
let currentCategory = null;
let jsonData = null; // cache JSON so we only fetch once

// Load JSON once at start
fetch("data/niveaux.json")
  .then(res => res.json())
  .then(data => {
    jsonData = data;
  });

// Populate dropdown
function populateDropdown(values, currentText) {
  dropdown.innerHTML = "";
  values.forEach(value => {
    const option = document.createElement("option");
    option.textContent = value;
    option.value = value;
    if (value === currentText) option.selected = true;
    dropdown.appendChild(option);
  });
}

// Attach one listener for all <li> inside .container
document.querySelectorAll(".container li").forEach(li => {
  li.addEventListener("click", () => {
    currentLi = li;
    currentCategory = li.closest(".container").dataset.category; // 👈 auto detect JSON key

    const currentText = li.childNodes[0].textContent.trim();
    const scoreSpan = li.querySelector(".score");

    if (jsonData && jsonData[currentCategory]) {
      populateDropdown(jsonData[currentCategory], currentText);
    } else {
      console.error(`Category ${currentCategory} not found in JSON`);
      dropdown.innerHTML = "<option>⚠️ No values</option>";
    }

    scoreInput.value = scoreSpan ? scoreSpan.textContent.trim() : "";
    dialog.showModal();
  });
});

// Save button
saveBtn.addEventListener("click", (e) => {
  e.preventDefault();
  if (currentLi) {
    const scoreSpan = currentLi.querySelector(".score");
    currentLi.childNodes[0].textContent = dropdown.value;
    if (scoreSpan) {
      scoreSpan.textContent = " " + scoreInput.value;
    }
  }
  dialog.close();
});


(function () {
  // Change handler: toggle "current" within the same .container
  function applyHighlight(radio) {
    const round = radio.closest('.round');
    if (!round) return;
    const container = round.closest('.container');
    if (!container) return;

    // Clear any previous highlights in this container
    container.querySelectorAll('ul.matchup.current')
      .forEach(ul => ul.classList.remove('current'));

    // Add highlight to all matchups in the selected round
    round.querySelectorAll('ul.matchup')
      .forEach(ul => ul.classList.add('current'));
  }

  // Global change listener (covers all containers)
  document.addEventListener('change', (e) => {
    if (e.target.matches('.round-details input[type="radio"]')) {
      applyHighlight(e.target);
    }
  });

  // On load: group radios per container, clear stray classes, set default, apply highlight
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.container').forEach((container, i) => {
      const radios = container.querySelectorAll('.round-details input[type="radio"]');

      // Give each container its own radio group
      radios.forEach(r => r.name = `current-group-${i}`);

      // Make sure no 'current' is pre-stuck from the HTML
      container.querySelectorAll('ul.matchup.current')
        .forEach(ul => ul.classList.remove('current'));

      // Pick default: first radio (or respect one already marked checked)
      let defaultRadio = container.querySelector('.round-details input[type="radio"]:checked') || radios[0];
      if (defaultRadio) {
        defaultRadio.checked = true;      // ensure it's actually checked
        applyHighlight(defaultRadio);     // apply the same logic as on change
      }
    });
  });
})();