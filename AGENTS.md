<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AfriConnecta

Платформа поиска африканских академических экспертов.

## Сначала прочитай

1. **[`docs/implementation-prompt.md`](docs/implementation-prompt.md)** — главный документ.
   Архитектура, схема БД, API, матрица авторизации, безопасность, план поставки.
   Все решения помечены: `[SRC]` из источника, `[FILL]` заполнено архитектором,
   `[DECIDED]` подтверждено заказчиком, `[BLOCKED]` **реализовывать запрещено**,
   `[LEGAL]` требует юриста.
2. [`docs/transcription.md`](docs/transcription.md) — расшифровка исходных PDF.
   Источник требований. **Редактировать запрещено.**
3. [`docs/decisions/`](docs/decisions/) — ADR по отступлениям от спецификации.

## Жёсткие правила

1. **Не выдумывай API.** Проверь сигнатуру в `node_modules` или документации. Неверный вызов
   хуже отсутствующего. Если не уверен — спроси, а не угадывай.
2. **`[BLOCKED]` не реализуется.** Заглушка с `TODO` вместо догадки. Открытые вопросы — §14.2.
3. **Deny by default.** Эндпоинт без явной политики доступа не мержится.
4. **Тесты авторизации пишутся до фичи.** Сначала строка в матрице §8.1 краснеет, потом
   появляется эндпоинт.
5. **Никаких секретов в клиентском коде.** `service_role`-ключ только на сервере; CI проверяет
   механически.
6. **Никаких LLM в цикле ранжирования** — обоснование в §6.4 (объяснимость требуется по §2.4).
7. **Списочные эндпоинты не отдают контакты и CV.** Главный вектор выкачивания базы, §7.
8. Отступление от `implementation-prompt.md` оформляется как ADR в `docs/decisions/`.

## Перед коммитом

```bash
npm run check   # типы + линт + формат + тесты — то же, что гоняет CI
```

## Конвенции кода

- Node 24 LTS (`.nvmrc`). Node 25 в системе — нечётная ветка без поддержки, не использовать.
- TypeScript strict, включая `noUncheckedIndexedAccess`.
- Ссылки и навигация — только через обёртки `@/i18n/navigation`, не через `next/link`
  и `next/navigation`. ESLint это проверяет.
- Обработчик запросов — `src/proxy.ts` (в Next 16 заменил `middleware.ts`).
- Новые пользовательские строки идут в `messages/<locale>.json`, не в JSX.
  `tests/messages.test.ts` уронит сборку при расхождении каталогов.
