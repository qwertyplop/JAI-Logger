---
title: JAI Request Debugger
emoji: 🚀
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
---

# JAI Request Debugger

Временный debug-инструмент для просмотра request/response payloads от JanitorAI, SillyTavern и похожих OpenAI-compatible клиентов.

Текущая целевая архитектура: **Vercel + Upstash Redis + ручное обновление логов кнопкой “Обновить”**. SSE и in-memory хранилище больше не используются для production-режима.

## Как работает

1. Админ открывает `/admin` и входит по неизменяемой секретной фразе из 6 слов.
2. В админке создается временная debug-ссылка для конечного пользователя.
3. Пользователь открывает сессионную ссылку и сам указывает полный endpoint своего провайдера — например URL до `/chat/completions`.
4. Пользователь копирует `/api/ai-debug/<token>` и вставляет его в Janitor/SillyTavern как OpenAI-compatible endpoint.
5. Клиент отправляет запросы на debug endpoint, сервер пересылает их на сохраненный provider endpoint и пишет request/response в Upstash Redis.
6. Пользователь или админ нажимает **Обновить**, чтобы вручную подтянуть новые логи.

## Почему не SSE / in-memory

- Vercel — serverless-платформа; один постоянный Node-процесс не гарантируется.
- In-memory сессии и логи могут исчезать или жить в разных инстансах.
- SSE/live connection хуже подходит под этот режим.
- Поэтому сессии и логи хранятся в Upstash Redis, а UI обновляет логи вручную.

## Ограничения безопасности

Инструмент ограничен только debug-сценарием для AI chat completions:

- принимаются только HTTPS endpoints;
- endpoint должен заканчиваться на `/chat/completions`;
- локальные/private network адреса запрещены;
- debug endpoint принимает только POST-запросы;
- сессии временные, максимум 60 минут;
- логи ограничены последними 200 записями на сессию.

## Vercel deployment

1. Создать Upstash Redis database.
2. В Vercel добавить environment variables:
   - `KV_REST_API_URL` и `KV_REST_API_TOKEN`, если подключаешь Vercel KV/Upstash integration;
   - или `UPSTASH_REDIS_REST_URL` и `UPSTASH_REDIS_REST_TOKEN`, если добавляешь plain Upstash вручную.
3. Опционально добавить `PUBLIC_ORIGIN=https://your-app.vercel.app`, чтобы generated links всегда были с правильным доменом.
4. Deploy из GitHub.

## Admin secret

По умолчанию используется захешированная 6-словная фраза. В коде хранится только SHA-256 hash. Если нужно заменить фразу, посчитай SHA-256 от новой строки и задай `ADMIN_SECRET_HASH` в Vercel env.

## Local commands

```bash
pnpm install
pnpm --dir frontend install
pnpm run typecheck
pnpm run build
```

Для локального serverful fallback можно запустить старый Express server:

```bash
pnpm run dev:server
```
