// Local dev + verification server (Node stdlib only, no deps).
// Serves public/ and exposes a REAL submit endpoint that re-validates the
// whole payload server-side using the SAME shared/schema.js the browser
// uses, then appends the accepted submission to submissions.jsonl.
//
//   node server.mjs           -> http://localhost:4300
//
import http from "node:http";
import { readFile, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { validateAll } from "./public/shared/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "public");
const PORT = process.env.PORT || 4300;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Cache-Control": "no-store", ...headers });
  res.end(body);
}

function reference() {
  return "FS-" + randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
}

async function handleSubmit(req, res) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) {
      send(res, 413, JSON.stringify({ ok: false, error: "Payload too large." }), {
        "Content-Type": MIME[".json"],
      });
      req.destroy();
      return;
    }
  }

  let data;
  try {
    data = JSON.parse(raw || "{}");
  } catch {
    send(res, 400, JSON.stringify({ ok: false, error: "Invalid JSON." }), {
      "Content-Type": MIME[".json"],
    });
    return;
  }

  // The server does not trust the client's gating — it re-runs validation.
  const { ok, errors } = validateAll(data);
  if (!ok) {
    send(res, 422, JSON.stringify({ ok: false, error: "Validation failed.", errors }), {
      "Content-Type": MIME[".json"],
    });
    return;
  }

  const record = {
    reference: reference(),
    receivedAt: new Date().toISOString(),
    name: data.name.trim(),
    email: data.email.trim(),
    projectType: data.projectType,
    budget: data.budget,
    timeline: data.timeline,
    details: data.details.trim(),
  };
  await appendFile(join(__dirname, "submissions.jsonl"), JSON.stringify(record) + "\n", "utf8");

  send(res, 200, JSON.stringify({ ok: true, reference: record.reference, storage: "file" }), {
    "Content-Type": MIME[".json"],
  });
}

async function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";

  // Everything (including /shared/schema.js) lives under public/.
  const filePath = normalize(join(PUBLIC, urlPath));
  if (!filePath.startsWith(PUBLIC)) return send(res, 403, "Forbidden");

  try {
    const body = await readFile(filePath);
    send(res, 200, body, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
  } catch {
    send(res, 404, "Not found");
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/submit") return handleSubmit(req, res);
  if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
  send(res, 405, "Method not allowed");
});

server.listen(PORT, () => {
  console.log(`Forge intake form running at http://localhost:${PORT}`);
});
