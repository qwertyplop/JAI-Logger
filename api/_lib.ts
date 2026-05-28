import crypto from "node:crypto";
import net from "node:net";

export const ADMIN_COOKIE = "jai_admin_session";
export const ADMIN_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
export const MAX_SESSION_TTL_MS = 60 * 60 * 1000;
export const MAX_LOGS_PER_SESSION = 200;
export const MAX_CAPTURE_CHARS = 80_000;
export const DEFAULT_ADMIN_SECRET_HASH = "ce34128fd5efe2e4fdf4725ee5268992db7f4d00b71f8cd08823b1011e1e267a";
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};
export const ADMIN_SECRET_HASH = (process.env.ADMIN_SECRET_HASH || DEFAULT_ADMIN_SECRET_HASH).trim().toLowerCase();
export const ADMIN_SECRET = stripWrappingQuotes(process.env.ADMIN_SECRET || "");


export type VercelRequestLike = Request & {
  headers: Headers | Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  url: string;
};

export function headerValue(req: Request, name: string) {
  const headers: any = req.headers;
  if (headers?.get) return headers.get(name) || headers.get(name.toLowerCase());
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function queryValue(req: Request, name: string) {
  const query = (req as VercelRequestLike).query;
  const value = query?.[name];
  if (Array.isArray(value)) return value[0];
  if (typeof value === "string") return value;
  return requestUrl(req).searchParams.get(name) || undefined;
}

export interface AccessSession {
  token: string;
  sessionId: string;
  upstreamUrl: string;
  label: string;
  expiresAt: number;
  createdAt: number;
}

export interface StoredLogEntry {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  durationMs: number;
  isStream: boolean;
  error: string | null;
}

function redisUrl() {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
}

function redisToken() {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
}

export function hasRedis() {
  return Boolean(redisUrl() && redisToken());
}

export async function redis<T = any>(command: unknown[]): Promise<T> {
  const url = redisUrl();
  const token = redisToken();
  if (!url || !token) throw new Error("Upstash Redis is not configured. Set KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN.");
  const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([command]),
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const first = data[0];
  if (first?.error) throw new Error(String(first.error));
  return first?.result as T;
}

export async function redisPipeline(commands: unknown[][]): Promise<any[]> {
  const url = redisUrl();
  const token = redisToken();
  if (!url || !token) throw new Error("Upstash Redis is not configured.");
  const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  for (const item of data) if (item?.error) throw new Error(String(item.error));
  return data.map((item: any) => item.result);
}

export function sessionKey(token: string) { return `jai:session:${token}`; }
export function logsKey(sessionId: string) { return `jai:logs:${sessionId}`; }
export const sessionsIndexKey = "jai:sessions:index";
export function adminKey(token: string) { return `jai:admin:${token}`; }

export function stripWrappingQuotes(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function normalizeSecret(value: string) {
  return stripWrappingQuotes(value)
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .join(" ");
}

export function canonicalSecret(value: string) {
  return normalizeSecret(value).toLowerCase();
}

export function sha256(value: string) {
  return crypto.createHash("sha256").update(normalizeSecret(value)).digest("hex");
}

export function sha256Lower(value: string) {
  return crypto.createHash("sha256").update(canonicalSecret(value)).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a.trim());
  const bBuffer = Buffer.from(b.trim());
  return aBuffer.length === bBuffer.length && crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function verifyAdminSecret(secret: unknown) {
  if (typeof secret !== "string") return false;
  const normalized = normalizeSecret(secret);
  const configuredSecret = normalizeSecret(ADMIN_SECRET || "");
  if (configuredSecret) {
    if (safeEqual(normalized, configuredSecret)) return true;
    if (safeEqual(canonicalSecret(normalized), canonicalSecret(configuredSecret))) return true;
  }
  return safeEqual(sha256(normalized), ADMIN_SECRET_HASH) || safeEqual(sha256Lower(normalized), ADMIN_SECRET_HASH);
}

export function newToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function parseCookies(header = "") {
  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    cookies[pair.slice(0, index).trim()] = decodeURIComponent(pair.slice(index + 1).trim());
  }
  return cookies;
}

export async function isAdmin(cookieHeader = "") {
  const cookie = parseCookies(cookieHeader)[ADMIN_COOKIE];
  if (!cookie) return false;
  return (await redis<string | null>(["GET", adminKey(cookie)])) === "1";
}

export async function requireAdmin(req: Request) {
  if (!(await isAdmin(headerValue(req, "cookie") || ""))) return json({ error: "Admin authorization required." }, 401);
  return null;
}

export async function getSession(token: string | null | undefined): Promise<AccessSession | null> {
  if (!token) return null;
  const raw = await redis<string | null>(["GET", sessionKey(token)]);
  return raw ? JSON.parse(raw) as AccessSession : null;
}

export async function saveSession(session: AccessSession) {
  const ttlSeconds = Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 1000));
  await redisPipeline([
    ["SET", sessionKey(session.token), JSON.stringify(session), "EX", ttlSeconds],
    ["ZADD", sessionsIndexKey, session.expiresAt, session.token],
  ]);
}

export async function deleteSession(token: string) {
  const session = await getSession(token);
  const commands: unknown[][] = [["DEL", sessionKey(token)], ["ZREM", sessionsIndexKey, token]];
  if (session) commands.push(["DEL", logsKey(session.sessionId)]);
  await redisPipeline(commands);
}

export async function listSessions(): Promise<Array<AccessSession & { remainingTime: number; logCount: number; connectedClients: number }>> {
  await redis(["ZREMRANGEBYSCORE", sessionsIndexKey, 0, Date.now()]);
  const tokens = await redis<string[]>(["ZRANGE", sessionsIndexKey, 0, -1]);
  if (!tokens.length) return [];
  const rawSessions = await redisPipeline(tokens.map((token) => ["GET", sessionKey(token)]));
  const sessions = rawSessions.filter(Boolean).map((raw) => JSON.parse(raw) as AccessSession);
  if (!sessions.length) return [];
  const logCounts = await redisPipeline(sessions.map((session) => ["LLEN", logsKey(session.sessionId)]));
  return sessions.map((session, index) => ({
    ...session,
    remainingTime: Math.max(0, session.expiresAt - Date.now()),
    logCount: Number(logCounts[index] || 0),
    connectedClients: 0,
  }));
}

export async function getLogs(sessionId: string): Promise<StoredLogEntry[]> {
  const logs = await redis<string[]>(["LRANGE", logsKey(sessionId), 0, MAX_LOGS_PER_SESSION - 1]);
  return logs.map((raw) => JSON.parse(raw) as StoredLogEntry);
}

export async function storeLog(sessionId: string, entry: StoredLogEntry) {
  await redisPipeline([
    ["LPUSH", logsKey(sessionId), JSON.stringify(entry)],
    ["LTRIM", logsKey(sessionId), 0, MAX_LOGS_PER_SESSION - 1],
    ["EXPIRE", logsKey(sessionId), Math.ceil(MAX_SESSION_TTL_MS / 1000)],
  ]);
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export async function sendResponse(res: any, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

export async function readJson(req: Request): Promise<any> {
  const anyReq: any = req;
  if (typeof anyReq.json === "function") {
    try { return await anyReq.json(); } catch { return {}; }
  }
  if (Buffer.isBuffer(anyReq.body)) {
    try { return JSON.parse(anyReq.body.toString("utf8")); } catch { return {}; }
  }
  if (anyReq.body instanceof Uint8Array) {
    try { return JSON.parse(Buffer.from(anyReq.body).toString("utf8")); } catch { return {}; }
  }
  if (typeof anyReq.body === "string") {
    try { return JSON.parse(anyReq.body); } catch { return {}; }
  }
  if (anyReq.body && typeof anyReq.body === "object") return anyReq.body;
  return {};
}

export async function readBodyBuffer(req: Request): Promise<Buffer> {
  const anyReq: any = req;
  if (typeof anyReq.arrayBuffer === "function") return Buffer.from(await anyReq.arrayBuffer());
  const chunks: Buffer[] = [];
  for await (const chunk of anyReq) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export function getPublicOrigin(req: Request) {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN;
  const proto = headerValue(req, "x-forwarded-proto") || "https";
  const host = headerValue(req, "x-forwarded-host") || headerValue(req, "host") || "localhost";
  return `${proto}://${host}`;
}

export function requestUrl(req: Request) {
  return new URL(req.url, getPublicOrigin(req));
}

export function routeParts(req: Request) {
  const url = requestUrl(req);
  const explicitPath = queryValue(req, "path");
  const pathname = explicitPath ? `/${explicitPath}` : url.pathname;
  const parts = pathname.split("/").filter(Boolean);
  return parts[0] === "api" ? parts.slice(1) : parts;
}

export function headerEntries(req: Request): Array<[string, string]> {
  const headers: any = req.headers;
  if (headers?.forEach) {
    const entries: Array<[string, string]> = [];
    headers.forEach((value: string, key: string) => entries.push([key, value]));
    return entries;
  }
  return Object.entries(headers || {}).flatMap(([key, value]) => {
    if (Array.isArray(value)) return value.map((item) => [key, String(item)] as [string, string]);
    if (typeof value === "undefined") return [];
    return [[key, String(value)] as [string, string]];
  });
}

export function getQueryToken(req: Request) {
  return queryValue(req, "token") || headerValue(req, "x-access-token");
}

export function getPathToken(req: Request, prefix: string) {
  const prefixParts = prefix.split("/").filter(Boolean);
  const parts = routeParts(req);
  return parts[prefixParts.length] || null;
}

export function redactHeaders(headers: Record<string, string>) {
  const redacted = { ...headers };
  for (const key of Object.keys(redacted)) {
    const lower = key.toLowerCase();
    if (lower === "authorization" || lower === "proxy-authorization" || lower === "x-api-key" || lower.includes("token") || lower.includes("secret") || lower.includes("key")) {
      redacted[key] = "[captured but hidden in header list]";
    }
  }
  return redacted;
}

export function truncateText(value: string | null) {
  if (!value) return value;
  return value.length > MAX_CAPTURE_CHARS ? `${value.slice(0, MAX_CAPTURE_CHARS)}\n...[truncated]` : value;
}

function isPrivateIp(hostname: string) {
  const ipVersion = net.isIP(hostname);
  if (!ipVersion) return false;
  if (ipVersion === 6) {
    const normalized = hostname.toLowerCase();
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
  }
  const parts = hostname.split(".").map(Number);
  const [a, b] = parts;
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0;
}

export type ProviderEndpointValidation =
  | { ok: true; url: URL }
  | { ok: false; error: string };

export function validateProviderEndpoint(value: string): ProviderEndpointValidation {
  let parsedUrl: URL;
  try { parsedUrl = new URL(value.trim()); } catch { return { ok: false, error: "Invalid upstream URL." }; }
  if (parsedUrl.protocol !== "https:") return { ok: false, error: "Only HTTPS provider endpoints are allowed." };
  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || isPrivateIp(hostname)) {
    return { ok: false, error: "Local or private network endpoints are not allowed." };
  }
  const normalizedPath = parsedUrl.pathname.replace(/\/+$/, "");
  if (!normalizedPath.endsWith("/chat/completions")) {
    return { ok: false, error: "Endpoint must point to an OpenAI-compatible /chat/completions URL." };
  }
  return { ok: true, url: parsedUrl };
}
