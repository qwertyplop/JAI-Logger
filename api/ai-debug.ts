import { getPathToken, requestUrl, getSession, json, newToken, redactHeaders, storeLog, truncateText, validateProviderEndpoint, type AccessSession, type StoredLogEntry } from "./_lib";

export const config = { runtime: "nodejs" };

const EXCLUDED_HEADERS = new Set(["host", "content-length", "transfer-encoding", "connection", "x-access-token"]);

export default async function handler(req: Request) {
  if (req.method.toUpperCase() === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method.toUpperCase() !== "POST") return json({ error: "Only POST requests to /chat/completions are allowed." }, 405);

  const session = await getSession(getPathToken(req, "/api/ai-debug"));
  if (!session) return json({ error: "Access token expired or invalid." }, 403);
  if (!session.upstreamUrl) return json({ error: "Provider endpoint is not configured for this session. Open the session link first." }, 400);

  const validation = validateProviderEndpoint(session.upstreamUrl);
  if (validation.ok === false) return json({ error: validation.error }, 400);

  const targetUrl = new URL(validation.url.href);
  const sourceUrl = requestUrl(req);
  for (const [key, value] of sourceUrl.searchParams.entries()) {
    if (key !== "token") targetUrl.searchParams.append(key, value);
  }

  const id = `${Date.now()}-${newToken(6)}`;
  const timestamp = new Date().toISOString();
  const startMs = Date.now();
  const bodyBuffer = Buffer.from(await req.arrayBuffer());
  const rawBody = bodyBuffer.length ? bodyBuffer.toString("utf8") : null;
  const requestHeaders: Record<string, string> = {};
  const forwardHeaders: Record<string, string> = {};

  req.headers.forEach((value, key) => {
    requestHeaders[key] = value;
    if (!EXCLUDED_HEADERS.has(key.toLowerCase())) forwardHeaders[key] = value;
  });

  try {
    const upstreamRes = await fetch(targetUrl.href, {
      method: "POST",
      headers: forwardHeaders,
      body: bodyBuffer.length ? new Uint8Array(bodyBuffer) : undefined,
    });

    const responseHeaders: Record<string, string> = {};
    const headers = new Headers();
    upstreamRes.headers.forEach((value, key) => {
      responseHeaders[key] = value;
      if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(key.toLowerCase())) headers.set(key, value);
    });

    const body = await upstreamRes.text();
    const entry: StoredLogEntry = {
      id,
      timestamp,
      method: "POST",
      path: targetUrl.href,
      requestHeaders: redactHeaders(requestHeaders),
      requestBody: truncateText(rawBody),
      responseStatus: upstreamRes.status,
      responseHeaders,
      responseBody: truncateText(body),
      durationMs: Date.now() - startMs,
      isStream: (upstreamRes.headers.get("content-type") || "").includes("text/event-stream"),
      error: null,
    };
    await storeLog((session as AccessSession).sessionId, entry);
    return new Response(body, { status: upstreamRes.status, headers });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    await storeLog(session.sessionId, {
      id,
      timestamp,
      method: "POST",
      path: targetUrl.href,
      requestHeaders: redactHeaders(requestHeaders),
      requestBody: truncateText(rawBody),
      responseStatus: 502,
      responseHeaders: {},
      responseBody: null,
      durationMs: Date.now() - startMs,
      isStream: false,
      error: errorMsg,
    });
    return json({ error: `AI debug forwarding error: ${errorMsg}` }, 502);
  }
}
