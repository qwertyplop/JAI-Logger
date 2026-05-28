import express, { type Request, type Response } from "express";
import cors from "cors";
import pino from "pino";
import pinoHttp from "pino-http";
import path from "path";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: process.env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
});

const app = express();
app.use(pinoHttp({ logger }));
app.use(cors());
app.use(express.json());

// --- SECURITY CONFIG ---
const ADMIN_SECRET = process.env.ADMIN_SECRET || "Noble Interest Keep Instruct Travel Ant";

interface AccessToken {
  expiresAt: number;
  sessionId: string;
  createdAt: number;
}

const accessTokens = new Map<string, AccessToken>();
const sessionClients = new Map<string, Set<Response>>();

function broadcastToSession(sessionId: string, entry: any) {
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

// --- MIDDLEWARE ---

const authGuard = (req: Request, res: Response, next: any) => {
  // Admin routes are handled separately with ADMIN_SECRET
  if (req.path.startsWith('/api/admin')) return next();

  const token = req.query.token as string || req.headers['x-access-token'] as string;
  
  if (!token) {
    return res.status(403).json({ error: "Access denied. Valid access token required." });
  }

  const access = accessTokens.get(token);
  if (!access || Date.now() > access.expiresAt) {
    if (access) accessTokens.delete(token);
    return res.status(403).json({ error: "Access token expired or invalid." });
  }

  // Attach sessionId to request for proxy/logs use
  (req as any).authorizedSessionId = access.sessionId;
  next();
};

// --- API ROUTES ---

// Admin: Health check
app.get("/api/healthz", (req, res) => res.json({ status: "ok" }));

// ADMIN ONLY: Generate Access Link
app.post("/api/admin/generate", (req: Request, res: Response) => {
  const { secret, durationMinutes = 30 } = req.body;
  
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: "Invalid admin secret." });
  }

  const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const sessionId = Math.random().toString(36).substring(2, 15);
  
  // Handle "Infinite" or very long durations
  const expiresAt = durationMinutes === -1 
    ? 2147483647000 // Approx year 2038
    : Date.now() + durationMinutes * 60 * 1000;

  accessTokens.set(token, { expiresAt, sessionId, createdAt: Date.now() });

  res.json({ 
    token, 
    sessionId, 
    expiresAt, 
    durationMinutes,
    link: `${process.env.CORS_ORIGIN || ''}/?token=${token}` 
  });
});

// ADMIN ONLY: List Sessions
app.get("/api/admin/sessions", (req: Request, res: Response) => {
  const { secret } = req.query;
  if (secret !== ADMIN_SECRET) return res.status(401).json({ error: "Invalid admin secret." });

  const sessions = Array.from(accessTokens.entries()).map(([token, data]) => ({
    token,
    ...data,
    remainingTime: Math.max(0, data.expiresAt - Date.now())
  }));

  res.json(sessions);
});

// ADMIN ONLY: Kill Session
app.delete("/api/admin/session/:token", (req: Request, res: Response) => {
  const { secret } = req.query;
  if (secret !== ADMIN_SECRET) return res.status(401).json({ error: "Invalid admin secret." });
  
  accessTokens.delete(req.params.token);
  res.json({ success: true });
});

// apply authGuard to a restricted namespace
app.use("/api/logs", authGuard);
app.use("/api/proxy", authGuard);

// SSE stream
app.get("/api/logs/stream", (req, res) => {
  const sessionId = (req as any).authorizedSessionId;
  if (!sessionId) return res.status(400).json({ error: "No authorized session" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  res.write(": connected\n\n");

  if (!sessionClients.has(sessionId)) sessionClients.set(sessionId, new Set());
  const clients = sessionClients.get(sessionId)!;
  clients.add(res);

  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); clients.delete(res); }
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
    if (clients.size === 0) sessionClients.delete(sessionId);
  });
});

const EXCLUDED_HEADERS = new Set(["host", launderHeader("content-length"), "transfer-encoding", "connection"]);
function launderHeader(h: string) { return h.toLowerCase(); }

// Proxy handler
app.use("/api/proxy", async (req: Request, res: Response) => {
  const sessionId = (req as any).authorizedSessionId;
  const segments = req.path.split('/').filter(Boolean);
  // Path: /api/proxy/:sessionId
  if (segments.length < 3) {
    return res.status(400).json({ error: "Invalid proxy path. Expected /api/proxy/:sessionId" });
  }

  const target = req.query.target as string;
  if (!target) return res.status(400).json({ error: "Missing target query param" });

  let targetUrl;
  try { targetUrl = new URL(target).href; } catch { return res.status(400).json({ error: "Invalid target URL" }); }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = new Date().toISOString();
  const startMs = Date.now();

  const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body) || null;
  const forwardHeaders: Record<string, string> = {};
  const requestHeaders: Record<string, string> = {};

  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") {
      requestHeaders[k] = v;
      if (!EXCLUDED_HEADERS.has(k.toLowerCase())) forwardHeaders[k] = v;
    }
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: ["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase()) ? undefined : rawBody,
    });

    const isStream = (upstreamRes.headers.get("content-type") ?? "").includes("text/event-stream");
    const responseHeaders: Record<string, string> = {};
    for (const [k, v] of upstreamRes.headers.entries()) {
      responseHeaders[k] = v;
      res.setHeader(k, v);
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
      
      const fullBody = chunks.join("");
      broadcastToSession(sessionId, {
        id, timestamp, method: req.method, path: targetUrl,
        requestHeaders, requestBody: rawBody,
        responseStatus: upstreamRes.status, responseHeaders,
        responseBody: fullBody.length > 50000 ? fullBody.slice(0, 50000) : fullBody,
        durationMs: Date.now() - startMs, isStream: true, error: null,
      });
    } else {
      const body = await upstreamRes.text();
      res.send(body);
      broadcastToSession(sessionId, {
        id, timestamp, method: req.method, path: targetUrl,
        requestHeaders, requestBody: rawBody,
        responseStatus: upstreamRes.status, responseHeaders,
        responseBody: body.length > 50000 ? body.slice(0, 50000) : body,
        durationMs: Date.now() - startMs, isStream: false, error: null,
      });
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    broadcastToSession(sessionId, {
      id, timestamp, method: req.method, path: targetUrl,
      requestHeaders, requestBody: rawBody,
      responseStatus: 502, responseHeaders: {}, responseBody: null,
      durationMs: Date.now() - startMs, isStream: false, error: errorMsg,
    });
    res.status(502).json({ error: `Proxy error: ${errorMsg}` });
  }
});

// --- STATIC FILES ---

const distPath = path.join(__dirname, "dist");
app.use(express.static(distPath));

app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "API route not found" });
  }
  res.sendFile(path.join(distPath, "index.html"));
});

const PORT = process.env.PORT || 7860; 
app.listen(PORT, "0.0.0.0", () => logger.info(`🚀 Monolithic Admin-Sentry started on port ${PORT}`));
