import { getLogs, getQueryToken, getSession, json, routeParts, sendResponse } from "./_lib";

export const config = { runtime: "nodejs" };

async function handle(req: Request) {
  const parts = routeParts(req);
  if (req.method.toUpperCase() !== "GET" || parts[0] !== "history") return json({ error: "API route not found" }, 404);
  const session = await getSession(getQueryToken(req));
  if (!session) return json({ error: "Access token expired or invalid." }, 403);
  return json({ session, logs: await getLogs(session.sessionId) });
}

export default async function handler(req: any, res: any) {
  await sendResponse(res, await handle(req as Request));
}
