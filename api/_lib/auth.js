import crypto from "node:crypto";

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function getSessionSecret() {
  // Prefer a dedicated session secret, fall back to the admin password.
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function isAdminPassword(password) {
  return Boolean(process.env.ADMIN_PASSWORD) && password === process.env.ADMIN_PASSWORD;
}

export function createAdminToken() {
  const secret = getSessionSecret();
  if (!secret) return null;

  const payload = base64url(
    JSON.stringify({ role: "admin", exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS })
  );
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

export function verifyAdminToken(token) {
  if (!token || typeof token !== "string") return false;

  const secret = getSessionSecret();
  if (!secret) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = sign(payload, secret);
  const given = Buffer.from(signature);
  const valid = Buffer.from(expected);
  if (given.length !== valid.length || !crypto.timingSafeEqual(given, valid)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.role !== "admin") return false;
    if (!data.exp || Math.floor(Date.now() / 1000) > data.exp) return false;
    return true;
  } catch {
    return false;
  }
}

function getBearerToken(req) {
  const header = String(req.headers?.authorization || req.headers?.Authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export function getPasswordFromRequest(req) {
  return String(
    req.headers?.["x-admin-password"] ||
    req.body?.password ||
    req.query?.password ||
    ""
  );
}

export function requireAdmin(req, res) {
  if (!getSessionSecret()) {
    res.status(500).json({ error: "Admin login is not configured. Please set ADMIN_PASSWORD in Vercel." });
    return false;
  }

  // Preferred: signed session token in the Authorization header.
  const token = getBearerToken(req);
  if (token && verifyAdminToken(token)) return true;

  // Backward-compatible password auth (e.g. multipart uploads that cannot set JSON headers).
  if (isAdminPassword(getPasswordFromRequest(req))) return true;

  res.status(401).json({ error: "Invalid or expired admin session" });
  return false;
}
