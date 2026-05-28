
import express, { type Request, type Response } from "express";
import cors from "cors";
import pino from "pino";
import pinoHttp from "pino-http";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: process.env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
});

const app = express();
app.use(pinoHttp({ logger }));
app.use(cors());

// Middleware to strip /api prefix from all requests
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    req.url = req.url.replace(/^\/api/, '');
  }
  next();
});

// For proxy routes, capture raw body as text so we forward it faithfully
app.use("/api/proxy", (req: Request, res: Response, next: (err?: any) => void) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())) return next();
  let data = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => { data += chunk; });
  req.on("end", () => {
    req.body = data;
    next();
  });
});

app.use(express.json());

interface LogEntry {
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

const sessionClients = new Map<string, Set<Response>>();

function broadcastToSession(sessionId: string, entry: LogEntry) {
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

// Health check
app.get("/healthz", (req, res) => res.json({ status: "ok" }));

// SSE stream
app.get("/logs/stream", (req, res) => {
  const sessionId = req.query.session as string;
  if (!sessionId) return res.status(400).json({ error: "Missing session query param" });

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

const EXCLUDED_HEADERS = new Set(["host", "content-length", "transfer-encoding", "connection"]);

// Global middleware to handle all proxy requests without path wildcards
app.use(async (req: Request, res: Response, next: (err?: any) => void) => {
  const path = req.path;
  // Only handle paths that start with /proxy/
  if (!path.startsWith("/proxy/")) {
    return next();
  }

  const segments = path.split('/').filter(Boolean);
  // Expect: ["proxy", "sessionId", ...]
  if (segments.length < 2) {
    return res.status(400).json({ error: "Invalid proxy path. Expected /proxy/:sessionId" });
  }

  const sessionId = segments[1];
  const target = req.query.target as string;

  if (!target) {
    return res.status(400).json({ error: "Missing target query param" });
  }

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

// Critical for Hugging Face: use port 7860 by default (or PORT env)
const PORT = process.env.PORT || 7860; 
app.listen(PORT, "0.0.0.0", () => logger.info(`Server started on port ${PORT}`));
