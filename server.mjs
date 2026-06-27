import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 2001;
const HOST = "127.0.0.1";
const ROOT = fileURLToPath(new URL(".", import.meta.url));

// ---------------------------------------------------------------------------
// Local development only.
//
// On Vercel the files in /api are deployed as serverless functions and storage
// is provided by KV / Upstash. This static server has no idea about any of
// that, so for local verification we wire up the same handlers here:
//   - route /api/* to the real handler modules
//   - back the storage layer with an in-memory KV that speaks the Upstash
//     REST "pipeline" protocol (so api/_lib/storage.js stays unchanged)
//   - provide a throwaway dev admin password when none is configured
//
// None of this code runs in production. No real secrets live here.
// ---------------------------------------------------------------------------

const LOCAL_KV_BASE = "/__local-kv";
const LOCAL_KV_PATH = `${LOCAL_KV_BASE}/pipeline`;

if (!process.env.KV_REST_API_URL && !process.env.UPSTASH_REDIS_REST_URL) {
  process.env.KV_REST_API_URL = `http://${HOST}:${PORT}${LOCAL_KV_BASE}`;
  process.env.KV_REST_API_TOKEN = "local-dev-token";
}

if (!process.env.ADMIN_PASSWORD) {
  // Throwaway local password. The real password is only ever set as an env var.
  process.env.ADMIN_PASSWORD = "local-admin";
  console.log('Local dev admin password: "local-admin" (set ADMIN_PASSWORD env to override).');
}

// In-memory store backing the local KV endpoint.
const kvStrings = new Map();
const kvSets = new Map();

function runKvCommand(command) {
  const [op, ...args] = command;
  switch (String(op).toUpperCase()) {
    case "GET":
      return kvStrings.has(args[0]) ? kvStrings.get(args[0]) : null;
    case "SET":
      kvStrings.set(args[0], args[1]);
      return "OK";
    case "MGET":
      return args.map((key) => (kvStrings.has(key) ? kvStrings.get(key) : null));
    case "SADD": {
      const set = kvSets.get(args[0]) || new Set();
      const added = set.has(args[1]) ? 0 : 1;
      set.add(args[1]);
      kvSets.set(args[0], set);
      return added;
    }
    case "SMEMBERS":
      return [...(kvSets.get(args[0]) || new Set())];
    case "SREM": {
      const set = kvSets.get(args[0]);
      const removed = set && set.delete(args[1]) ? 1 : 0;
      return removed;
    }
    case "DEL": {
      const existed = kvStrings.delete(args[0]) || kvSets.delete(args[0]);
      return existed ? 1 : 0;
    }
    default:
      return null;
  }
}

const apiHandlers = {
  "/api/admin/login": () => import("./api/admin/login.js"),
  "/api/site-config": () => import("./api/site-config.js"),
  "/api/orders": () => import("./api/orders.js")
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(""));
  });
}

function makeRes(nodeRes) {
  return {
    statusCode: 200,
    setHeader: (key, value) => nodeRes.setHeader(key, value),
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      nodeRes.writeHead(this.statusCode, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      });
      nodeRes.end(JSON.stringify(payload));
      return this;
    },
    end(data) {
      nodeRes.writeHead(this.statusCode);
      nodeRes.end(data);
      return this;
    }
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  // Local in-memory KV endpoint (mimics the Upstash REST pipeline protocol).
  if (pathname === LOCAL_KV_PATH && req.method === "POST") {
    const raw = await readBody(req);
    let results = [];
    try {
      const commands = JSON.parse(raw);
      results = commands.map((command) => ({ result: runKvCommand(command) }));
    } catch {
      results = [];
    }
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(results));
    return;
  }

  // API routes -> real serverless handlers.
  if (pathname.startsWith("/api/")) {
    const load = apiHandlers[pathname];
    if (!load) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    const raw = await readBody(req);
    let body;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    req.body = body;
    req.query = Object.fromEntries(url.searchParams.entries());

    try {
      const mod = await load();
      await mod.default(req, makeRes(res));
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: error?.message || "Server error" }));
    }
    return;
  }

  // Static files. Map /admin -> admin.html like the Vercel rewrite does.
  let requestedPath = pathname;
  if (requestedPath === "/") requestedPath = "/index.html";
  else if (requestedPath === "/admin") requestedPath = "/admin.html";

  const filePath = normalize(join(ROOT, requestedPath));

  if (!filePath.startsWith(ROOT) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  res.writeHead(200, {
    "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
    "cache-control": "no-store"
  });
  createReadStream(filePath).pipe(res);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Please stop the process using 127.0.0.1:${PORT} and run npm start again.`);
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  console.log(`Colour Clip Watch is running at http://${HOST}:${PORT}`);
});
