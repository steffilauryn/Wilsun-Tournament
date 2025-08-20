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
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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

    // PUT /resultats  -> save just the team name (string) at [category][slot]
if (url.pathname === "/resultats" && req.method === "PUT") {
  if (!cors.allowAny && !cors.isAllowed) {
    return json({ error: "Origin not allowed", origin: cors.reqOrigin }, 403, cors.headers);
  }

  let body = {};
  try { body = await req.json(); } catch {}
  const { category, slot, value } = body || {};

  if (![category, slot, value].every(v => typeof v === "string" && v.trim() !== "")) {
    return json({ error: "category, slot, value required (strings)" }, 400, cors.headers);
  }

  const current = (await env.RESULTATS.get("resultats", { type: "json" })) || {};
  if (!current[category]) current[category] = {};
  current[category][slot] = value;   // <-- string again

  await env.RESULTATS.put("resultats", JSON.stringify(current));
  return json({ ok: true, saved: { category, slot, value } }, 200, cors.headers);
}


    return json({ error: "Not found" }, 404, cors.headers);
  },
};
