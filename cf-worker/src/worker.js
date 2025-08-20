export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "*";

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowed === "*" ? "*" : allowed,
      "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };

    // Preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // GET /resultats -> return whole object
    if (url.pathname === "/resultats" && req.method === "GET") {
      const json = await env.RESULTATS.get("resultats", { type: "json" });
      const data = json || {};
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // PUT /resultats  body: { category, slot, value }
    if (url.pathname === "/resultats" && req.method === "PUT") {
      let body = {};
      try { body = await req.json(); } catch {}
      const { category, slot, value } = body || {};

      if (![category, slot, value].every(v => typeof v === "string")) {
        return new Response(JSON.stringify({ error: "category, slot, value required (strings)" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const current = (await env.RESULTATS.get("resultats", { type: "json" })) || {};
      if (!current[category]) current[category] = {};
      current[category][slot] = value;

      await env.RESULTATS.put("resultats", JSON.stringify(current));

      return new Response(JSON.stringify({ ok: true, saved: { category, slot, value } }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (url.pathname === "/health") {
      return new Response("ok", { headers: corsHeaders });
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};
