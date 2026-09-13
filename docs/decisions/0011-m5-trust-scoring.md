# ADR-0011. M5 Trust: ACS в TypeScript, матчинг без эмбеддингов (Q7)

- **Статус:** принято
- **Дата:** 2026-09-13
- **Контекст:** §5, §6, §11 M5 `docs/implementation-prompt.md`, Q7 `[BLOCKED]`

## Контекст

M5 требует Verification (домен + ручная), ACS и матчинг с журналом `match_runs`.
Q7 (бюджет эмбеддингов) всё ещё `[BLOCKED]` — внешний API добавляет получателя данных
в NCSA. LLM в ранжировании запрещён (§6.4).

## Решения

**1. ACS считается в TypeScript на сервере, пишется в `african_context_scores`.**

Чистая функция + unit/fairness-тесты (§5.3) воспроизводимее, чем plpgsql. Клиент не
пишет баллы (deny by default). Пересчёт — server action / админ с `audit_log`.

**2. Компонент contribution = `max(local_presence, diaspora_contribution)` (Q4).**

В `components` храним обе ветки; в итог идёт максимум. Тест справедливости RW vs CA —
падение сборки при расхождении > 5 баллов на идентичных входах.

**3. Матчинг без эмбеддингов до ответа на Q7.**

`expertise = tag_overlap` по иерархии (без cosine). `research_relevance = 0.5` (нейтраль
§6.3 при отсутствии публикаций). Двухстадийный отбор + пол сохранены. После Q7 —
отдельный ADR на cosine-ветку, не ломая `algorithm_version`.

**4. Verification Фазы 1: домен email + очередь админа.**

ORCID / Scholarship — Phase 1.5, заглушка `TODO`. Институцию верифицирует админ RPC
(`verified_at`); эксперт запрашивает affiliation по совпадению домена почты с `website`.

**5. Доступ — RLS + server actions, без `/api/v1` в этой поставке.**

Как M3/M4. ACS с разбивкой — владелец или админ (§8.1). `match_runs` — члены институции
прогона.
