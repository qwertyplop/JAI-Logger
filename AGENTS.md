# JAI-Logger Project Notes

- User language for this project: Russian.
- Product framing: JAI Request Debugger, a temporary AI request/response debugger for JanitorAI, SillyTavern, and similar OpenAI-compatible clients. Avoid presenting it as a generic/open proxy.
- Required flow: admin logs into `/admin` with immutable six-word phrase, generates a temporary debug session link, user opens that link, enters their own HTTPS provider endpoint ending in `/chat/completions`, then copies `/api/ai-debug/<token>` into their client.
- Hugging Face compliance constraints: HTTPS only, no localhost/private/link-local hosts, endpoint path must end in `/chat/completions`, POST only, no arbitrary path forwarding, session TTL max 60 minutes, in-memory logs/sessions only.
- Server entrypoint: `server.ts`; default port is `7860` or `PORT`.
- Frontend entrypoint: `frontend/src/main.tsx`; routes are `/` for the user debug view and `/admin` for token/session management.
- Auth model: admin phrase is checked via `ADMIN_SECRET_HASH` in `server.ts`; admin session uses HttpOnly cookie; access tokens authorize user debug sessions.
- Validate changes with `pnpm exec tsc --noEmit`, `pnpm -C frontend run typecheck`, and `pnpm -C frontend run build`.
- Be careful with secrets: never commit plaintext admin phrases or HF/GitHub tokens.
