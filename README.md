---
title: JAI Proxy Logger
emoji: 🚀
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
---

# JAI Proxy Logger

Прокси-логгер с админ-панелью для JanitorAI, SillyTavern и похожих клиентов.

## Как работает

1. Админ открывает `/admin` и входит по неизменяемой секретной фразе из 6 слов.
2. В админке создается временная сессионная ссылка для конечного пользователя.
3. Пользователь открывает сессионную ссылку и сам указывает полный endpoint своего провайдера — например URL до `/chat/completions`.
4. Пользователь копирует proxy endpoint и вставляет его в JanitorAI / SillyTavern / другой клиент.
5. Клиент отправляет запросы через логгер, логгер проксирует их на endpoint пользователя и сохраняет request/response в памяти.
6. Пользователь видит свои логи на сессионной странице, админ может открыть логи любой активной сессии.

Сессии и логи специально хранятся только в памяти процесса: это временный debugging-инструмент, а не долговременное хранилище. После рестарта Hugging Face Space они сбрасываются.

## Основные маршруты

- `/admin` — админ-панель.
- `/?token=<session-token>` — пользовательская страница временной сессии.
- `/api/session/upstream?token=<session-token>` — сохранение endpoint провайдера для сессии.
- `/api/proxy/<session-token>` — proxy endpoint, удобный для вставки в клиенты.
- `/api/proxy?token=<session-token>` — альтернативный proxy endpoint.
- `/api/logs/history?token=<session-token>` — история логов сессии.
- `/api/logs/stream?token=<session-token>` — SSE поток новых логов.

## Безопасность

- Админ-фраза не хранится открытым текстом: сервер сравнивает SHA-256 hash.
- После входа админ получает HttpOnly cookie; пароль не передается в URL.
- Пользовательские ссылки временные и могут быть отозваны из админки.
- Authorization / API-key-like headers скрываются в списке headers, но тело request/response логируется полностью — это ожидаемое поведение для debugging.

## Локальная разработка

```bash
pnpm install
pnpm -C frontend install
pnpm -C frontend run build
pnpm start
```

Проверки:

```bash
pnpm exec tsc --noEmit
pnpm -C frontend run typecheck
pnpm -C frontend run build
```

## Hugging Face Spaces

Проект рассчитан на Docker Space. `Dockerfile` собирает фронтенд и запускает Express сервер на `PORT` или `7860`.
