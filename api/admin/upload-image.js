import { put } from "@vercel/blob";
import { requireAdmin } from "../_lib/auth.js";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE = 3 * 1024 * 1024;

export const config = {
  api: {
    bodyParser: false
  }
};

async function readRequest(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function getBoundary(contentType) {
  return contentType.split("boundary=")[1];
}

function parseMultipart(buffer, boundary) {
  const boundaryText = `--${boundary}`;
  const parts = buffer.toString("binary").split(boundaryText);

  for (const part of parts) {
    if (!part.includes('name="image"')) continue;

    const [rawHeaders, rawBody] = part.split("\r\n\r\n");
    if (!rawHeaders || !rawBody) continue;

    const filenameMatch = rawHeaders.match(/filename="([^"]+)"/);
    const typeMatch = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i);
    const filename = filenameMatch ? filenameMatch[1] : "image";
    const contentType = typeMatch ? typeMatch[1].trim() : "application/octet-stream";
    const body = rawBody.replace(/\r\n--$/, "").replace(/\r\n$/, "");

    return {
      filename,
      contentType,
      buffer: Buffer.from(body, "binary")
    };
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!requireAdmin(req, res)) return;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({
      error: "Image upload is not configured. Please set BLOB_READ_WRITE_TOKEN in Vercel."
    });
  }

  const contentType = String(req.headers["content-type"] || "");
  const boundary = getBoundary(contentType);

  if (!boundary) {
    return res.status(400).json({ error: "Missing image upload data" });
  }

  const body = await readRequest(req);
  const image = parseMultipart(body, boundary);

  if (!image) {
    return res.status(400).json({ error: "Missing image file" });
  }

  if (!ALLOWED_TYPES.has(image.contentType)) {
    return res.status(400).json({ error: "Only jpg, jpeg, png and webp images are allowed" });
  }

  if (image.buffer.length > MAX_SIZE) {
    return res.status(400).json({ error: "Image must be 3MB or smaller" });
  }

  const safeName = image.filename.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
  const pathname = `site-images/${Date.now()}-${safeName}`;
  const blob = await put(pathname, image.buffer, {
    access: "public",
    contentType: image.contentType
  });

  return res.status(200).json({ url: blob.url });
}
