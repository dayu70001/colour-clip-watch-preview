import { isAdminPassword, createAdminToken } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: "Admin login is not configured. Please set ADMIN_PASSWORD in Vercel." });
  }

  if (!isAdminPassword(String(req.body?.password || ""))) {
    return res.status(401).json({ error: "Invalid admin password" });
  }

  const token = createAdminToken();
  if (!token) {
    return res.status(500).json({ error: "Admin session secret is not configured." });
  }

  return res.status(200).json({ ok: true, token, expiresIn: 7 * 24 * 60 * 60 });
}
