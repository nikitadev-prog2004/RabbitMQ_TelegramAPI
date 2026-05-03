# Микросервисы: RabbitMQ + NestJS + Telegram

Монорепозиторий на **Nest.js (TypeScript)**: **Producer** публикует JSON-события в **RabbitMQ** (`messageId`/UUID, ретраи публикации), **Consumer** читает очередь с ручным **ack/nack** и ретраями, **Telegram-сервис** принимает HTTP и вызывает **Telegram Bot API**. Развёртывание через **Docker Compose**.

**Пошаговая инструкция для заказчика / запуска с нуля:** [docs/ИНСТРУКЦИЯ_ПО_ЗАПУСКУ.md](./docs/ИНСТРУКЦИЯ_ПО_ЗАПУСКУ.md).

## Архитектура

- **`packages/contracts`** — `EventEnvelope`, паттерн `notification.dispatch`.
- **`apps/producer`** — `POST /events`, **`PublishEventUseCase`**, порт **`EventPublisherPort`**; Swagger: `http://localhost:<PRODUCER_PORT>/api/docs` (по умолчанию **3001**).
- **`apps/consumer`** — RabbitMQ + `GET /health` и Swagger **`/api/docs`** на **`HTTP_PORT`** (по умолчанию **3002**); сценарий **`ProcessNotificationUseCase`**, порты **`IdempotencyPort`** / **`TelegramSenderPort`**; идемпотентность — память или **Redis** (`REDIS_URL`).
- **`apps/telegram`** — `POST /notifications`, **`SendNotificationUseCase`**, порт **`TelegramDeliveryPort`**; Swagger: `http://localhost:<TELEGRAM_PORT>/api/docs` (по умолчанию **3003**).

Поток: **Producer → очередь `notification_events` → Consumer → HTTP → Telegram-сервис → api.telegram.org**.

### Принципы

Модули разделены по ответственности (SOLID); общий контракт в `packages/contracts`; входящие/исходящие зависимости сценариев оформлены как **порты** (интерфейсы) с реализациями-адаптерами (Nest providers).

## Требования

- Node.js **18+**, npm **9+** (workspaces)
- Docker — для RabbitMQ локально или для **docker compose** всего стека

> На Windows при ошибках `npm` в пути с не-ASCII символами перенесите проект в каталог с латинским путём.

## Установка и сборка

В корне репозитория (где `package.json` и `apps/`):

```bash
cp .env.example .env
# Windows (PowerShell): Copy-Item .env.example .env
```

Заполните в `.env` как минимум **`TELEGRAM_BOT_TOKEN`**, **`TELEGRAM_CHAT_ID`**. Если до `api.telegram.org` таймаут — см. раздел [Telegram и сеть](#telegram-и-сеть).

```bash
npm install
npm run build -w @notification/contracts
npm run build
```

Сборка и unit-тесты **всех** workspace из корня (см. корневой `package.json`): `npm run build`, `npm test`.

## Запуск локально

1. **RabbitMQ** (отдельный терминал или уже запущенный контейнер):

   ```bash
   docker run -d --hostname rabbitmq --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management-alpine
   ```

2. Из **корня репозитория** три процесса в **трёх терминалах** (удобный порядок: сначала **telegram**, затем **producer** и **consumer**):

   ```bash
   npm run start:dev -w @notification/telegram
   ```

   ```bash
   npm run start:dev -w @notification/producer
   ```

   ```bash
   npm run start:dev -w @notification/consumer
   ```

3. Проверка: `http://localhost:3002/health` → `{"status":"ok",...}`.

4. Событие в очередь и дальше в Telegram (тип **`telegram.notify`**):

   **PowerShell** (одна строка, JSON в одинарных кавычках):

   ```powershell
   curl.exe -X POST http://localhost:3001/events -H "Content-Type: application/json" -d '{"type":"telegram.notify","payload":{"text":"Тест из Producer"}}'
   ```

Идемпотентность: необязательное поле **`messageId`** (UUID); если не передать — сгенерирует Producer. Несколько реплик consumer: задайте **`REDIS_URL`**, иначе дубликаты видит только один процесс (in-memory `Set`).

## Telegram и сеть

- **`TELEGRAM_CHAT_ID`** — **числовой** id пользователя (или чата), **не** телефон и **не** `@username` в этом поле. В Telegram откройте своего бота и нажмите **Start**; id можно взять у [@userinfobot](https://t.me/userinfobot) или из `getUpdates` после сообщения боту. Иначе API вернёт **`chat not found`**.
- Если прямой доступ к **`api.telegram.org`** даёт **ETIMEDOUT**, используйте VPN или прокси:
  - **Одна строка URL:** `TELEGRAM_HTTPS_PROXY` (или `HTTPS_PROXY`) — например локальный Clash `http://127.0.0.1:7890`, либо `socks5://127.0.0.1:7891`.
  - **Удалённый HTTP-прокси с логином/паролем** (например Astrill): надёжнее задать **`TELEGRAM_PROXY_HOST`**, **`TELEGRAM_PROXY_PORT`**, **`TELEGRAM_PROXY_USER`**, **`TELEGRAM_PROXY_PASSWORD`** — пароль так не ломается спецсимволами и `#` в `.env`.
- Приоритет: если задан **`TELEGRAM_HTTPS_PROXY`**, он используется; иначе собирается URL из **`TELEGRAM_PROXY_*`**.
- **`TELEGRAM_MOCK_SEND=true`** — `POST /notifications` отвечает успехом **без** запроса к Telegram (только разработка при блокировке). Для реальных сообщений — **`false`** или удалите переменную.
- Сервис **telegram** при старте подгружает `.env` из корня монорепо (см. `apps/telegram/src/main.ts`), чтобы переменные были доступны до инициализации Nest.

## Docker Compose

Рядом с `docker-compose.yml` создайте `.env` с **`TELEGRAM_BOT_TOKEN`** и **`TELEGRAM_CHAT_ID`**. При необходимости добавьте те же прокси-переменные, что и для локали.

```bash
docker compose up --build
```

| Сервис   | Порт        | Описание                          |
|----------|-------------|-----------------------------------|
| Producer | 3001        | `POST /events`, Swagger `/api/docs` |
| Consumer | 3002        | `GET /health`, Swagger `/api/docs` |
| Telegram | 3003        | `POST /notifications`, Swagger `/api/docs` |
| RabbitMQ | 5672, 15672 | AMQP; UI обычно **15672** (`guest`/`guest`) |
| Redis    | 6379        | Идемпотентность consumer в Docker Compose |

## Переменные окружения

Полный шаблон — [`.env.example`](./.env.example).

| Переменная | Назначение |
|------------|------------|
| `PRODUCER_PORT` / `TELEGRAM_PORT` | HTTP-порты producer и telegram (**не** используйте два раза общий ключ `PORT` в одном `.env`) |
| `HTTP_PORT` | HTTP consumer (health) |
| `RABBITMQ_URL` / `RABBITMQ_QUEUE` | AMQP; очередь должна совпадать у producer и consumer |
| `RABBITMQ_PREFETCH` | Prefetch consumer (по умолчанию **10**) |
| `IDEMPOTENCY_MAX_ENTRIES` | Лимит in-memory идемпотентности без Redis |
| `TELEGRAM_SERVICE_URL` | Базовый URL telegram-сервиса для consumer (локально `http://localhost:3003`) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Bot API; chat id — числовой id после **Start** у бота |
| `TELEGRAM_HTTPS_PROXY` / `HTTPS_PROXY` / `HTTP_PROXY` | Прокси одной строкой (локальный HTTP/SOCKS) |
| `TELEGRAM_PROXY_HOST` / `TELEGRAM_PROXY_PORT` / `TELEGRAM_PROXY_USER` / `TELEGRAM_PROXY_PASSWORD` | Удалённый HTTP-прокси с авторизацией |
| `TELEGRAM_MOCK_SEND` | `true` — мок ответа без вызова Telegram |
| `TELEGRAM_HTTP_TIMEOUT_MS` | Таймаут HTTPS к api.telegram.org (по умолчанию 30000) |
| `RABBITMQ_PUBLISH_RETRIES` | Ретраи публикации (producer) |
| `CONSUMER_MAX_RETRIES` | Лимит `requeue` при ошибке обработки |
| `REDIS_URL` | Если задан — учёт обработанных `messageId` в Redis с TTL |
| `REDIS_IDEMPOTENCY_TTL_SECONDS` | TTL ключей в Redis (по умолчанию **604800**, 7 суток) |
| `CONSUMER_RMQ_AUTO_ACK` | `true` — `noAck` у RabbitMQ, **без** вызовов `ack`/`nack` в коде (только отладка; см. комментарий в `.env.example`) |

## Тесты

```bash
npm test -w @notification/producer
npm test -w @notification/consumer
npm test -w @notification/telegram
npm run test:e2e -w @notification/producer
npm run test:e2e -w @notification/consumer
npm run test:e2e -w @notification/telegram
```

Интеграционные тесты (**Testcontainers**, нужен **Docker**):

- **RabbitMQ → consumer** (emit в очередь, исходящий Telegram — мок-адаптер).
- **HTTP `POST /events` (producer) → RabbitMQ → consumer → HTTP `POST /notifications`** (локальный mock вместо реального telegram-сервиса).

```bash
npm run test:integration
```

Без Docker: `SKIP_INTEGRATION=1 npm run test:integration` (наборы пропускаются).

## API (кратко)

- **Producer** `POST /events` — `{ "messageId?": "uuid", "type": "telegram.notify", "payload": { "text": "..." } }`.
- **Telegram** `POST /notifications` — `{ "text": "...", "parseMode?": "HTML", "chatId?": "..." }` (поле `chatId` опционально, иначе берётся `TELEGRAM_CHAT_ID`).

OpenAPI: **Swagger** на producer, consumer и telegram по пути **`/api/docs`**.

## Структура репозитория

```
├── apps/
│   ├── producer/
│   ├── consumer/
│   └── telegram/
├── packages/
│   └── contracts/
├── docker/
│   ├── producer.Dockerfile
│   ├── consumer.Dockerfile
│   └── telegram.Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## Лицензия

MIT (учебный / демонстрационный проект).
