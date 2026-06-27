import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 2001;
const HOST = "127.0.0.1";
const ROOT = fileURLToPath(new URL(".", import.meta.url));

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

const server = http.createServer((req, res) => {
  const rawPath = decodeURIComponent(new URL(req.url ?? "/", `http://${HOST}`).pathname);
  const requestedPath = rawPath === "/" ? "/index.html" : rawPath;
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
