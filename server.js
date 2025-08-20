// server.js
const express = require("express");
const fs = require("fs").promises;
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const RESULTATS_PATH = path.join(DATA_DIR, "resultats.json");
const NIVEAUX_PATH = path.join(DATA_DIR, "niveaux.json");

// Parse JSON bodies
app.use(express.json());

// Serve your static files (index.html, index.js, index.css, etc.)
app.use(express.static(ROOT));

// --- READ endpoints ---
app.get("/api/niveaux", (req, res) => {
  res.sendFile(NIVEAUX_PATH);
});
app.get("/api/resultats", (req, res) => {
  res.sendFile(RESULTATS_PATH);
});

// --- WRITE endpoint: save one selection ---
app.put("/api/resultats", async (req, res) => {
  try {
    const { category, slot, value } = req.body;

    if (
      typeof category !== "string" ||
      typeof slot !== "string" ||
      typeof value !== "string"
    ) {
      return res.status(400).json({ error: "category, slot and value are required strings." });
    }

    // Load current file
    const raw = await fs.readFile(RESULTATS_PATH, "utf-8");
    const json = JSON.parse(raw);

    // Make sure the category exists
    if (!json[category]) json[category] = {};

    // Update value
    json[category][slot] = value;

    // Persist to disk
    await fs.writeFile(RESULTATS_PATH, JSON.stringify(json, null, 2), "utf-8");

    res.json({ ok: true, saved: { category, slot, value } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update resultats.json" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
