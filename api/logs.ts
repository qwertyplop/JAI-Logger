import { getLogs, getQueryToken, getSession, json } from "./_lib";

export const config = { runtime: "nodejs" };

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean).slice(1);
  if (req.method.toUpperCase() !== "GET" || parts[0] !== "history") return json({ error: "API route not found" }, 404);
  const session = await getSession(getQueryToken(req));
  if (!session) return json({ error: "Access token expired or invalid." }, 403);
  return json({ session, logs: await getLogs(session.sessionId) });
}
