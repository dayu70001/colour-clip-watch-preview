import { requireAdmin } from "./_lib/auth.js";
import { getJson, setJson, storageError } from "./_lib/storage.js";

const CONFIG_KEY = "colour-clip-watch:site-config";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const config = await getJson(CONFIG_KEY, null);
      return res.status(200).json({ config });
    }

    if (req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const config = req.body?.config;

      if (!config || typeof config !== "object") {
        return res.status(400).json({ error: "Missing site config" });
      }

      await setJson(CONFIG_KEY, config);
      return res.status(200).json({ ok: true, config });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || storageError() });
  }
}
