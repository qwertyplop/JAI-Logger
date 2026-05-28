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

## Как работает

1. Админ открывает `/admin` и входит по неизменяемой секретной фразе из 6 слов.
2. В админке создается временная debug-ссылка для конечного пользователя.
3. Пользователь открывает ссылку и сам указывает полный HTTPS endpoint своего AI-провайдера — например URL до `/v1/chat/completions`.
4. Пользователь копирует AI debug endpoint и временно вставляет его в JanitorAI / SillyTavern / другой клиент.
5. Клиент отправляет POST-запросы через debug endpoint; приложение пересылает их только на заранее сохраненный `/chat/completions` endpoint пользователя и показывает request/response логи.

## API

- `/admin` — админ-панель.
- `/api/admin/login` — вход админа, ставит HttpOnly cookie.
- `/api/admin/sessions` — создать временную debug-сессию.
- `/api/session` — данные текущей пользовательской сессии.
- `/api/session/upstream` — сохранить provider endpoint для текущей сессии.
- `/api/ai-debug/<session-token>` — AI debug endpoint для вставки в клиент.
- `/api/logs/stream?token=<session-token>` — SSE поток логов.
- `/api/logs/history?token=<session-token>` — история логов текущей сессии.

## Ограничения безопасности

Инструмент ограничен только debug-сценарием для AI chat completions:

- принимаются только HTTPS endpoints;
- endpoint должен заканчиваться на `/chat/completions`;
- localhost, private network и link-local адреса запрещены;
- пересылаются только POST-запросы;
- пересылка идет только к сохраненному endpoint, без произвольных путей;
- сессии временные, максимум 60 минут;
- логи живут только в памяти процесса и нужны для дебага.

## Admin secret

В production открытая фраза не хранится в коде. Сервер проверяет SHA-256 hash фразы.

Текущая фраза известна владельцу проекта. Для смены фразы нужно заменить `ADMIN_SECRET_HASH` в `server.ts`.

## Локальный запуск

```bash
pnpm install
pnpm -C frontend install
pnpm -C frontend run build
pnpm start
```

Откройте:

- `http://localhost:7860/admin`
- `http://localhost:7860/`

## Hugging Face Spaces

Проект рассчитан на Docker Space. Dockerfile собирает Vite frontend и запускает Express server на `PORT` / `7860`.
