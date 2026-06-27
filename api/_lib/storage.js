const STORAGE_ERROR = "Storage is not configured. Please set KV or Upstash Redis environment variables.";

function envConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token };
}

export function storageConfigured() {
  const { url, token } = envConfig();
  return Boolean(url && token);
}

export function storageError() {
  return STORAGE_ERROR;
}

async function redis(command) {
  const { url, token } = envConfig();

  if (!url || !token) {
    const error = new Error(STORAGE_ERROR);
    error.status = 500;
    throw error;
  }

  const response = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([command])
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data?.error || "Storage request failed");
    error.status = response.status;
    throw error;
  }

  return data?.[0]?.result;
}

export async function getJson(key, fallback = null) {
  const value = await redis(["GET", key]);
  if (!value) return fallback;
  return JSON.parse(value);
}

export async function setJson(key, value) {
  await redis(["SET", key, JSON.stringify(value)]);
  return value;
}

export async function listJson(keys) {
  if (!keys.length) return [];
  const values = await redis(["MGET", ...keys]);
  return (values || []).filter(Boolean).map((value) => JSON.parse(value));
}

export async function addToSet(key, value) {
  await redis(["SADD", key, value]);
}

export async function setMembers(key) {
  return await redis(["SMEMBERS", key]) || [];
}
