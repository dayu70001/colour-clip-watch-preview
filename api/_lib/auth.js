export function isAdminPassword(password) {
  return Boolean(process.env.ADMIN_PASSWORD) && password === process.env.ADMIN_PASSWORD;
}

export function getPasswordFromRequest(req) {
  return String(
    req.headers["x-admin-password"] ||
    req.body?.password ||
    req.query?.password ||
    ""
  );
}

export function requireAdmin(req, res) {
  if (!process.env.ADMIN_PASSWORD) {
    res.status(500).json({ error: "Admin login is not configured. Please set ADMIN_PASSWORD in Vercel." });
    return false;
  }

  if (!isAdminPassword(getPasswordFromRequest(req))) {
    res.status(401).json({ error: "Invalid admin password" });
    return false;
  }

  return true;
}
