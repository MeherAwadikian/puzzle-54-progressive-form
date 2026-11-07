// Cloudflare Worker: serves the static form (via the [assets] binding) and
// handles POST /api/submit with the SAME server-side validation as the local
// Node server. Accepted submissions are stored in a KV namespace when one is
// bound (INTAKE_KV); if not, the submit still succeeds and returns a reference
// (storage:"memory") so the Worker is deployable with zero extra setup.
import { validateAll } from "./public/shared/schema.js";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function reference() {
  return "FS-" + crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/submit") {
      if (request.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

      let data;
      try {
        data = await request.json();
      } catch {
        return json({ ok: false, error: "Invalid JSON." }, 400);
      }

      const { ok, errors } = validateAll(data);
      if (!ok) return json({ ok: false, error: "Validation failed.", errors }, 422);

      const record = {
        reference: reference(),
        receivedAt: new Date().toISOString(),
        name: String(data.name).trim(),
        email: String(data.email).trim(),
        projectType: data.projectType,
        budget: data.budget,
        timeline: data.timeline,
        details: String(data.details).trim(),
      };

      if (env.INTAKE_KV) {
        await env.INTAKE_KV.put(`submission:${record.reference}`, JSON.stringify(record));
        return json({ ok: true, reference: record.reference, storage: "kv" });
      }
      return json({ ok: true, reference: record.reference, storage: "memory" });
    }

    // Everything else -> static assets binding.
    return env.ASSETS.fetch(request);
  },
};
