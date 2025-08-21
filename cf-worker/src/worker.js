// cf-worker/src/worker.js

// --- CORS helpers -----------------------------------------------------------
function parseAllowed(originsStr) {
  if (!originsStr || originsStr.trim() === "") return ["*"];
  return originsStr
    .split(",")
    .map(s => s.trim().replace(/\/$/, "")) // strip trailing slash
    .filter(Boolean);
}

function buildCors(req, allowedList) {
  const reqOrigin = req.headers.get("Origin") || "";
  const allowAny = allowedList.includes("*");
  const isAllowed = allowAny || allowedList.includes(reqOrigin);

  const headers = {
    /*"Access-Control-Allow-Methods": "GET,PUT,OPTIONS",*/
    "Access-Control-Allow-Methods": "GET,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Edit-Key",
    "Access-Control-Max-Age": "86400",
  };

  if (allowAny) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else if (isAllowed) {
    headers["Access-Control-Allow-Origin"] = reqOrigin;
    headers["Vary"] = "Origin";
  } else {
    headers["Access-Control-Allow-Origin"] = allowedList[0] || "";
    headers["Vary"] = "Origin";
  }

  return { headers, isAllowed, allowAny, reqOrigin };
}

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });

// --- Worker -----------------------------------------------------------------
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const allowedList = parseAllowed(env.ALLOWED_ORIGIN);
    const cors = buildCors(req, allowedList);
    const hasOrigin = !!cors.reqOrigin; // address-bar navs usually have no Origin

    // Preflight
    if (req.method === "OPTIONS") {
      const status = (!cors.allowAny && !cors.isAllowed) ? 403 : 204;
      return new Response(null, { status, headers: cors.headers });
    }

    // Health
    if (url.pathname === "/health") {
      return new Response("ok", { headers: cors.headers });
    }

    // GET /resultats  -> allow even with no Origin (for quick browser checks)
    if (url.pathname === "/resultats" && req.method === "GET") {
      const data = (await env.RESULTATS.get("resultats", { type: "json" })) || {};

      // If there was no Origin header, return a permissive header so the page renders
      const headers = { ...cors.headers };
      if (!hasOrigin) {
        headers["Access-Control-Allow-Origin"] = "*";
        delete headers["Vary"];
      }
      return json(data, 200, headers);
    }

    // PUT /resultats  -> enforce allowed origins + edit key
    if (url.pathname === "/resultats" && req.method === "PUT") {
      if (!cors.allowAny && !cors.isAllowed) {
        return json({ error: "Origin not allowed", origin: cors.reqOrigin }, 403, cors.headers);
      }

      // ✅ Require the secret header for writes (place it right here)
      const providedKey = req.headers.get("X-Edit-Key") || "";
      if (!env.EDIT_KEY || providedKey !== env.EDIT_KEY) {
        return json({ error: "Invalid or missing edit key" }, 401, cors.headers);
      }

      // proceed with body parsing & save
      let body = {};
      try { body = await req.json(); } catch {}

      const { category, slot, value, score } = body || {};
      if (![category, slot, value].every(v => typeof v === "string" && v.trim() !== "")) {
        return json({ error: "category, slot, value required (strings)" }, 400, cors.headers);
      }

      // load current
      const current = (await env.RESULTATS.get("resultats", { type: "json" })) || {};
      if (!current[category]) current[category] = {};
      // store as an object with team + score
      current[category][slot] = {
        team: value,
        ...(typeof score === "string" && score.trim() !== "" ? { score: score.trim() } : {})
      };

      await env.RESULTATS.put("resultats", JSON.stringify(current));
      return json({ ok: true, saved: { category, slot, team: value, score: score ?? "" } }, 200, cors.headers);
    }

    // DELETE /resultats  -> remove a specific slot under a category
    if (url.pathname === "/resultats" && req.method === "DELETE") {
    if (!cors.allowAny && !cors.isAllowed) {
        return json({ error: "Origin not allowed", origin: cors.reqOrigin }, 403, cors.headers);
    }

    // Require the secret header for deletes too
    const providedKey = req.headers.get("X-Edit-Key") || "";
    if (!env.EDIT_KEY || providedKey !== env.EDIT_KEY) {
        return json({ error: "Invalid or missing edit key" }, 401, cors.headers);
    }

    let body = {};
    try { body = await req.json(); } catch {}
    const { category, slot } = body || {};
    if (![category, slot].every(v => typeof v === "string" && v.trim() !== "")) {
        return json({ error: "category and slot required (strings)" }, 400, cors.headers);
    }

    const current = (await env.RESULTATS.get("resultats", { type: "json" })) || {};
    const existed = !!current?.[category]?.[slot];

    if (current[category]) {
        delete current[category][slot];
        // optional: remove empty category
        if (Object.keys(current[category]).length === 0) {
        delete current[category];
        }
    }

    await env.RESULTATS.put("resultats", JSON.stringify(current));
    return json({ ok: true, removed: existed, category, slot }, 200, cors.headers);
    }


    return json({ error: "Not found" }, 404, cors.headers);
  },
};
