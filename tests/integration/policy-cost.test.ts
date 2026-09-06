import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DATABASE_URL } from './local-stack';

/**
 * Политики доступа не должны звать помощников прав на каждую строку.
 *
 * Проверка механическая, потому что вручную это не замечают. Дефект не виден ни в тексте
 * политики, ни в результате запроса: права проверяются правильно, ответы верные, просто
 * каждая строка тянет за собой запрос к public.users внутри security definer. На двух
 * засеянных профилях разницы нет вообще, на десяти тысячах — 192 мс против 7,6.
 *
 * Обоснование правки и замер — supabase/migrations/20260906210000_policy_initplan.sql.
 */

/** Помощники без аргументов: их значение одинаково для всех строк, значит выносится. */
const HOISTABLE = ['is_admin', 'current_user_role'];

let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
});

afterAll(async () => {
  await db.end();
});

type PolicyRow = { tablename: string; policyname: string; expr: string };

describe('стоимость политик', () => {
  it('бесаргументные помощники обёрнуты в (select ...)', async () => {
    const { rows } = await db.query<PolicyRow>(
      `select tablename, policyname,
              coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
       from pg_policies
       where schemaname = 'public'
       order by tablename, policyname`,
    );

    expect(rows.length).toBeGreaterThan(0);

    // Обёрнутый вызов Postgres печатает как «( SELECT is_admin() AS is_admin)»,
    // необёрнутый — просто «is_admin()». Различие в том, стоит ли перед именем SELECT,
    // поэтому ищем сам вызов вместе с необязательным SELECT слева и смотрим, попал он
    // в совпадение или нет.
    const pattern = new RegExp(`(SELECT\\s+)?\\b(?:public\\.)?(${HOISTABLE.join('|')})\\(\\)`, 'g');

    const offenders = rows.flatMap((row) =>
      [...row.expr.matchAll(pattern)]
        .filter((match) => match[1] === undefined)
        .map((match) => `${row.tablename}.${row.policyname}: ${match[2]}()`),
    );

    expect(offenders).toEqual([]);
  });

  it('чтение профилей не вызывает current_user_role на каждую строку', async () => {
    // План — единственное место, где видно разницу: InitPlan означает один вызов,
    // упоминание функции в Filter означает вызов на строку. Проверяется именно план,
    // а не время: измерение времени в тесте зависит от машины и наполнения базы.
    await db.query('begin');

    try {
      await db.query("select set_config('request.jwt.claims', '', true)");
      await db.query('set local role anon');

      const { rows } = await db.query(
        `explain (costs off)
         select id from public.experts
         where deleted_at is null and published_at is not null`,
      );

      // Колонка ответа EXPLAIN называется «QUERY PLAN», с пробелом внутри имени.
      const plan = rows.map((row) => String(Object.values(row)[0])).join('\n');
      const filters = plan
        .split('\n')
        .filter((line) => /Filter:|Index Cond:|Recheck Cond:/.test(line))
        .join('\n');

      for (const helper of HOISTABLE) {
        expect(filters, `${helper} остался в фильтре: план ${plan}`).not.toContain(`${helper}(`);
      }
    } finally {
      await db.query('rollback');
    }
  });
});
