# JAI-Logger Project Notes

- User language for this project: Russian.
- Product framing: JAI Request Debugger, a temporary AI request/response debugger for JanitorAI, SillyTavern, and similar OpenAI-compatible clients. Avoid presenting it as a generic/open proxy.
- Target deployment: Vercel + Upstash Redis. Production must not rely on in-memory sessions/logs or SSE; UI uses manual Refresh polling.
- Required flow: admin logs into `/admin` with immutable six-word phrase, generates a temporary session link, user opens that link, enters their own provider endpoint ending in `/chat/completions`, copies `/api/ai-debug/<token>` into their client, then manually refreshes logs in the UI.
- Security/product limits: HTTPS-only provider endpoints, no localhost/private IPs, only `/chat/completions`, only POST forwarding, no arbitrary path forwarding, session TTL max 60 minutes, Redis logs/sessions expire.
- Serverless API routes live in `api/`; shared Vercel/Upstash logic is in `api/_lib.ts`. The old `server.ts` remains as a local/serverful fallback but production work should target `api/`.
- Frontend entrypoint: `frontend/src/main.tsx`; routes are `/` for the user debugger view and `/admin` for token/session management.
- Auth model: admin phrase is checked via `ADMIN_SECRET_HASH`; admin session uses HttpOnly cookie; access tokens authorize user debug sessions.
- Be careful with secrets: do not hardcode production admin secrets or Upstash credentials; use Vercel env vars / `.env.example` names.
