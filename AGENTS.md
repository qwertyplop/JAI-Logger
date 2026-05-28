# JAI-Logger Project Notes

- User language for this project: Russian.
- Purpose: Proxy Logger with Admin Panel for JanitorAI, SillyTavern, and similar clients.
- Required flow: admin logs into `/admin` with immutable six-word phrase, generates a temporary session link, user opens that link, enters their own provider endpoint (often full URL up to `/chat/completions`), copies proxy endpoint, and uses it in their platform.
- Admin must be able to see active sessions, revoke sessions, and inspect user request/response logs.
- Sessions and logs are intentionally in-memory only: this is a debugging tool, and temporary links limit abuse. Do not add persistence unless the user explicitly asks.
- Server entrypoint: `server.ts`; default port is `7860` or `PORT`; intended deployment target is Docker-based Hugging Face Spaces free tier.
- Frontend entrypoint: `frontend/src/main.tsx`; routes are `/` for the user logger view and `/admin` for token/session management.
- Auth model: admin phrase is stored only as SHA-256 hash in code; admin sessions use HttpOnly cookie; access tokens authorize `/api/session/upstream`, `/api/logs/*`, and `/api/proxy`.
- Build/check commands: from repo root run `pnpm exec tsc --noEmit`; from `frontend/` run `pnpm run typecheck` and `pnpm run build`.
