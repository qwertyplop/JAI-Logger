import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pino from "pino";
import pinoHttp from "pino-http";
import path from "path";
import crypto from "crypto";
import net from "net";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: process.env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
});

const app = express();
app.use(pinoHttp({ logger: logger as any }));
app.use(cors());

const jsonParser = express.json({ limit: "25mb" });
const urlencodedParser = express.urlencoded({ extended: true, limit: "25mb" });
const rawBodyParser = express.raw({ type: "*/*", limit: "25mb" });

const ADMIN_SECRET_HASH = "ce34128fd5efe2e4fdf4725ee5268992db7f4d00b71f8cd08823b1011e1e267a";
const ADMIN_COOKIE = "jai_admin_session";
const ADMIN_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_SESSION_TTL_MS = 60 * 60 * 1000;
const MAX_LOGS_PER_SESSION = 200;
const MAX_CAPTURE_CHARS = 80_000;

interface AccessSession {
  token: string;
  sessionId: string;
  upstreamUrl: string;
  label: string;
  expiresAt: number;
  createdAt: number;
}

interface StoredLogEntry {
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

const accessSessions = new Map<string, AccessSession>();
const sessionClients = new Map<string, Set<Response>>();
const sessionLogs = new Map<string, StoredLogEntry[]>();
const adminSessions = new Map<string, number>();

function sha256(value: string) {
  return crypto.createHash("sha256").update(value.trim()).digest("hex");
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && crypto.timingSafeEqual(aBuffer, bBuffer);
}

function newToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function parseCookies(header = "") {
  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    cookies[pair.slice(0, index).trim()] = decodeURIComponent(pair.slice(index + 1).trim());
  }
  return cookies;
}

function isAdmin(req: Request) {
  const cookie = parseCookies(req.headers.cookie)[ADMIN_COOKIE];
  if (!cookie) return false;
  const expiresAt = adminSessions.get(cookie);
  if (!expiresAt || Date.now() > expiresAt) {
    adminSessions.delete(cookie);
    return false;
  }
  return true;
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdmin(req)) return res.status(401).json({ error: "Admin authorization required." });
  next();
}

function getPublicOrigin(req: Request) {
  return process.env.PUBLIC_ORIGIN || `${req.protocol}://${req.get("host")}`;
}

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of accessSessions) {
    if (now > session.expiresAt) {
      accessSessions.delete(token);
      sessionClients.delete(session.sessionId);
    }
  }
  for (const [token, expiresAt] of adminSessions) {
    if (now > expiresAt) adminSessions.delete(token);
  }
}

function redactHeaders(headers: Record<string, string>) {
  const redacted = { ...headers };
  for (const key of Object.keys(redacted)) {
    const lower = key.toLowerCase();
    if (lower === "authorization" || lower === "proxy-authorization" || lower === "x-api-key" || lower.includes("token") || lower.includes("secret") || lower.includes("key")) {
      redacted[key] = "[captured but hidden in header list]";
    }
  }
  return redacted;
}

function truncateText(value: string | null) {
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

function validateProviderEndpoint(value: string): { ok: true; url: URL } | { ok: false; error: string } {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value.trim());
  } catch {
    return { ok: false, error: "Invalid upstream URL." };
  }

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

function storeLog(sessionId: string, entry: StoredLogEntry) {
  const logs = sessionLogs.get(sessionId) || [];
  logs.unshift(entry);
  if (logs.length > MAX_LOGS_PER_SESSION) logs.length = MAX_LOGS_PER_SESSION;
  sessionLogs.set(sessionId, logs);
  broadcastToSession(sessionId, entry);
}

function broadcastToSession(sessionId: string, entry: StoredLogEntry) {
  const clients = sessionClients.get(sessionId);
  if (!clients) return;
  const data = `data: ${JSON.stringify(entry)}\n\n`;
  for (const client of clients) {
    try {
      client.write(data);
    } catch {
      clients.delete(client);
    }
  }
}

function getTokenFromDebugPath(req: Request) {
  if (!req.baseUrl.startsWith("/api/ai-debug")) return null;
  const firstSegment = req.path.split("/").filter(Boolean)[0];
  return firstSegment || null;
}

function getAccessSession(req: Request) {
  pruneExpiredSessions();
  const token = (req.query.token as string | undefined) || (req.headers["x-access-token"] as string | undefined) || getTokenFromDebugPath(req);
  if (!token) return null;
  return accessSessions.get(token) || null;
}

const authGuard = (req: Request, res: Response, next: NextFunction) => {
  const session = getAccessSession(req);
  if (!session) return res.status(403).json({ error: "Access token expired or invalid." });
  (req as any).accessSession = session;
  next();
};

app.get("/api/healthz", (_req, res) => res.json({ status: "ok" }));

app.post("/api/admin/login", jsonParser, (req: Request, res: Response) => {
  const { secret } = req.body;
  if (typeof secret !== "string" || !safeEqual(sha256(secret), ADMIN_SECRET_HASH)) {
    return res.status(401).json({ error: "Invalid admin secret." });
  }

  const token = newToken(32);
  adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  res.setHeader("Set-Cookie", `${ADMIN_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(ADMIN_SESSION_TTL_MS / 1000)}`);
  res.json({ ok: true });
});

app.post("/api/admin/logout", requireAdmin, (_req, res) => {
  res.setHeader("Set-Cookie", `${ADMIN_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

app.get("/api/admin/me", (req, res) => res.json({ authenticated: isAdmin(req) }));

app.post("/api/admin/sessions", requireAdmin, jsonParser, (req: Request, res: Response) => {
  const { durationMinutes = 30, label = "" } = req.body;
  pruneExpiredSessions();

  const requestedMinutes = Number(durationMinutes);
  if (!Number.isFinite(requestedMinutes) || requestedMinutes <= 0) {
    return res.status(400).json({ error: "Session duration must be between 1 and 60 minutes." });
  }

  const durationMs = Math.min(requestedMinutes * 60 * 1000, MAX_SESSION_TTL_MS);
  const token = newToken();
  const sessionId = newToken(12);
  const session: AccessSession = {
    token,
    sessionId,
    upstreamUrl: "",
    label: typeof label === "string" ? label.trim().slice(0, 80) : "",
    expiresAt: Date.now() + durationMs,
    createdAt: Date.now(),
  };

  accessSessions.set(token, session);
  res.json({ ...session, link: `${getPublicOrigin(req)}/?token=${encodeURIComponent(token)}` });
});

app.get("/api/admin/sessions", requireAdmin, (_req: Request, res: Response) => {
  pruneExpiredSessions();
  const sessions = Array.from(accessSessions.values()).map((session) => ({
    ...session,
    remainingTime: Math.max(0, session.expiresAt - Date.now()),
    logCount: sessionLogs.get(session.sessionId)?.length || 0,
    connectedClients: sessionClients.get(session.sessionId)?.size || 0,
  }));
  res.json(sessions);
});

app.get("/api/admin/sessions/:token/logs", requireAdmin, (req: Request, res: Response) => {
  const session = accessSessions.get(req.params.token);
  if (!session) return res.status(404).json({ error: "Session not found." });
  res.json(sessionLogs.get(session.sessionId) || []);
});

app.delete("/api/admin/sessions/:token", requireAdmin, (req: Request, res: Response) => {
  const session = accessSessions.get(req.params.token);
  accessSessions.delete(req.params.token);
  if (session) sessionClients.delete(session.sessionId);
  res.json({ success: true });
});

app.delete("/api/admin/sessions/:token/logs", requireAdmin, (req: Request, res: Response) => {
  const session = accessSessions.get(req.params.token);
  if (!session) return res.status(404).json({ error: "Session not found." });
  sessionLogs.set(session.sessionId, []);
  res.json({ success: true });
});

app.post("/api/session/upstream", authGuard, jsonParser, (req: Request, res: Response) => {
  const session = (req as any).accessSession as AccessSession;
  const { upstreamUrl } = req.body;

  if (typeof upstreamUrl !== "string" || !upstreamUrl.trim()) {
    return res.status(400).json({ error: "Upstream URL is required." });
  }

  const validation = validateProviderEndpoint(upstreamUrl);
  if (!validation.ok) return res.status(400).json({ error: validation.error });

  session.upstreamUrl = validation.url.href;
  res.json({ session });
});

app.use("/api/logs", authGuard);
app.use("/api/ai-debug", rawBodyParser, authGuard);

app.get("/api/logs/history", (req, res) => {
  const session = (req as any).accessSession as AccessSession;
  res.json({ session, logs: sessionLogs.get(session.sessionId) || [] });
});

app.get("/api/logs/stream", (req, res) => {
  const session = (req as any).accessSession as AccessSession;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  res.write(": connected\n\n");

  if (!sessionClients.has(session.sessionId)) sessionClients.set(session.sessionId, new Set());
  const clients = sessionClients.get(session.sessionId)!;
  clients.add(res);

  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); clients.delete(res); }
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
    if (clients.size === 0) sessionClients.delete(session.sessionId);
  });
});

const EXCLUDED_HEADERS = new Set(["host", "content-length", "transfer-encoding", "connection", "x-access-token"]);

app.use(["/api/ai-debug"], async (req: Request, res: Response) => {
  const session = (req as any).accessSession as AccessSession;
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST requests to /chat/completions are allowed." });
  if (!session.upstreamUrl) {
    return res.status(400).json({ error: "Upstream URL is not configured for this session. Open the session link and set your provider endpoint first." });
  }

  const validation = validateProviderEndpoint(session.upstreamUrl);
  if (!validation.ok) return res.status(400).json({ error: validation.error });

  const targetUrl = new URL(validation.url.href);

  for (const [key, value] of Object.entries(req.query)) {
    if (key === "token") continue;
    if (Array.isArray(value)) {
      for (const item of value) targetUrl.searchParams.append(key, String(item));
    } else if (value !== undefined) {
      targetUrl.searchParams.set(key, String(value));
    }
  }

  const id = `${Date.now()}-${newToken(6)}`;
  const timestamp = new Date().toISOString();
  const startMs = Date.now();
  const rawBodyBuffer = Buffer.isBuffer(req.body) ? req.body : undefined;
  const rawBody = rawBodyBuffer?.length ? rawBodyBuffer.toString("utf8") : null;
  const forwardHeaders: Record<string, string> = {};
  const requestHeaders: Record<string, string> = {};

  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value !== "string") continue;
    requestHeaders[key] = value;
    if (!EXCLUDED_HEADERS.has(key.toLowerCase())) forwardHeaders[key] = value;
  }

  try {
    const upstreamRes = await fetch(targetUrl.href, {
      method: req.method,
      headers: forwardHeaders,
      body: ["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase()) ? undefined : rawBodyBuffer ? new Uint8Array(rawBodyBuffer) : undefined,
    });

    const isStream = (upstreamRes.headers.get("content-type") ?? "").includes("text/event-stream");
    const responseHeaders: Record<string, string> = {};
    for (const [key, value] of upstreamRes.headers.entries()) {
      responseHeaders[key] = value;
      if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }

    res.status(upstreamRes.status);

    if (isStream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const chunks: string[] = [];
      const reader = upstreamRes.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          chunks.push(text);
          res.write(text);
        }
      }
      res.end();

      storeLog(session.sessionId, {
        id, timestamp, method: req.method, path: targetUrl.href,
        requestHeaders: redactHeaders(requestHeaders), requestBody: truncateText(rawBody),
        responseStatus: upstreamRes.status, responseHeaders,
        responseBody: truncateText(chunks.join("")),
        durationMs: Date.now() - startMs, isStream: true, error: null,
      });
    } else {
      const body = await upstreamRes.text();
      res.send(body);
      storeLog(session.sessionId, {
        id, timestamp, method: req.method, path: targetUrl.href,
        requestHeaders: redactHeaders(requestHeaders), requestBody: truncateText(rawBody),
        responseStatus: upstreamRes.status, responseHeaders,
        responseBody: truncateText(body),
        durationMs: Date.now() - startMs, isStream: false, error: null,
      });
    }
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err: errorMsg }, "AI debug forwarding failed");
    storeLog(session.sessionId, {
      id, timestamp, method: req.method, path: targetUrl.href,
      requestHeaders: redactHeaders(requestHeaders), requestBody: truncateText(rawBody),
      responseStatus: 502, responseHeaders: {}, responseBody: null,
      durationMs: Date.now() - startMs, isStream: false, error: errorMsg,
    });
    res.status(502).json({ error: `AI debug forwarding error: ${errorMsg}` });
  }
});

const distPath = path.join(__dirname, "dist");
app.use(express.static(distPath));

app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) return res.status(404).json({ error: "API route not found" });
  res.sendFile(path.join(distPath, "index.html"));
});

const PORT = Number(process.env.PORT || 7860);
app.listen(PORT, "0.0.0.0", () => logger.info(`🚀 JAI Request Debugger started on port ${PORT}`));
