export default async function handler(req, res) {
  const query = String(req.query.q || "").trim();

  if (query.length < 3) {
    return res.status(200).json({ features: [] });
  }

  const token = process.env.MAPBOX_ACCESS_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "Missing MAPBOX_ACCESS_TOKEN environment variable"
    });
  }

  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");

  url.searchParams.set("q", query);
  url.searchParams.set("access_token", token);
  url.searchParams.set("types", "address");
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("limit", "5");
  url.searchParams.set("language", "en");
  url.searchParams.set(
    "country",
    "gb,ie,fr,de,it,es,pt,nl,be,ch,no,se,dk,fi,at,pl,gr,cz,ro,hu,hr,sk,si,ee,lv,lt,lu,mt,cy,is,tr"
  );

  try {
    const mapboxResponse = await fetch(url.toString());
    const data = await mapboxResponse.json();

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

    return res.status(mapboxResponse.status).json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Mapbox address lookup failed"
    });
  }
}
