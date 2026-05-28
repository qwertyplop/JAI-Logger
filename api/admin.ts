import { ADMIN_COOKIE, ADMIN_SESSION_TTL_MS, MAX_SESSION_TTL_MS, adminKey, deleteSession, getLogs, getPublicOrigin, getSession, headerValue, isAdmin, json, listSessions, routeParts, newToken, readJson, redis, requireAdmin, saveSession, verifyAdminSecret } from "./_lib";

export const config = { runtime: "nodejs" };

export default async function handler(req: Request) {
  const parts = routeParts(req);
  const method = req.method.toUpperCase();

  if (method === "POST" && parts[0] === "login") {
    const { secret } = await readJson(req);
    if (!verifyAdminSecret(secret)) return json({ error: "Invalid admin secret." }, 401);
    const token = newToken(32);
    await redis(["SET", adminKey(token), "1", "EX", Math.floor(ADMIN_SESSION_TTL_MS / 1000)]);
    return json({ ok: true }, 200, { "Set-Cookie": `${ADMIN_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=${Math.floor(ADMIN_SESSION_TTL_MS / 1000)}` });
  }

  if (method === "POST" && parts[0] === "logout") {
    return json({ ok: true }, 200, { "Set-Cookie": `${ADMIN_COOKIE}=; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=0` });
  }

  if (method === "GET" && parts[0] === "me") return json({ authenticated: await isAdmin(headerValue(req, "cookie") || "") });

  const adminError = await requireAdmin(req);
  if (adminError) return adminError;

  if (parts[0] === "sessions" && !parts[1]) {
    if (method === "GET") return json(await listSessions());
    if (method === "POST") {
      const { durationMinutes = 30, label = "" } = await readJson(req);
      const requestedMinutes = Number(durationMinutes);
      if (!Number.isFinite(requestedMinutes) || requestedMinutes <= 0) return json({ error: "Session duration must be between 1 and 60 minutes." }, 400);
      const durationMs = Math.min(requestedMinutes * 60 * 1000, MAX_SESSION_TTL_MS);
      const token = newToken();
      const sessionId = newToken(12);
      const session = {
        token,
        sessionId,
        upstreamUrl: "",
        label: typeof label === "string" ? label.trim().slice(0, 80) : "",
        expiresAt: Date.now() + durationMs,
        createdAt: Date.now(),
      };
      await saveSession(session);
      return json({ ...session, link: `${getPublicOrigin(req)}/?token=${encodeURIComponent(token)}` });
    }
  }

  if (parts[0] === "sessions" && parts[1]) {
    const token = decodeURIComponent(parts[1]);
    const session = await getSession(token);
    if (!session) return json({ error: "Session not found." }, 404);
    if (method === "DELETE" && !parts[2]) {
      await deleteSession(token);
      return json({ success: true });
    }
    if (method === "GET" && parts[2] === "logs") return json(await getLogs(session.sessionId));
    if (method === "DELETE" && parts[2] === "logs") {
      await redis(["DEL", `jai:logs:${session.sessionId}`]);
      return json({ success: true });
    }
  }

  return json({ error: "API route not found" }, 404);
}
