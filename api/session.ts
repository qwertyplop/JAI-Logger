import { getQueryToken, getSession, json, readJson, saveSession, validateProviderEndpoint } from "./_lib";

export const config = { runtime: "nodejs" };

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean).slice(1);
  if (req.method.toUpperCase() !== "POST" || parts[0] !== "upstream") return json({ error: "API route not found" }, 404);
  const session = await getSession(getQueryToken(req));
  if (!session) return json({ error: "Access token expired or invalid." }, 403);
  const { upstreamUrl } = await readJson(req);
  if (typeof upstreamUrl !== "string" || !upstreamUrl.trim()) return json({ error: "Upstream URL is required." }, 400);
  const validation = validateProviderEndpoint(upstreamUrl);
  if (validation.ok === false) return json({ error: validation.error }, 400);
  session.upstreamUrl = validation.url.href;
  await saveSession(session);
  return json({ session });
}
