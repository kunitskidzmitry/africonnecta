import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

import { describe, expect, it } from 'vitest';

/**
 * Страховка от самой дорогой ошибки в Supabase-проекте: таблица создана,
 * а RLS на ней забыли — и она становится доступна анонимному пользователю
 * через автогенерируемый REST API.
 *
 * Проверка статическая: разбирает файлы миграций, поэтому работает в CI
 * без поднятой базы и без секретов.
 */

const migrationsDir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));

function readMigrations(): string {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(`${migrationsDir}${file}`, 'utf-8'))
    .join('\n');
}

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

const sql = stripComments(readMigrations()).toLowerCase();

const createdTables = [...sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)/g)].map(
  (match) => match[1] as string,
);

const rlsEnabledTables = new Set(
  [...sql.matchAll(/alter table (?:public\.)?(\w+) enable row level security/g)].map(
    (match) => match[1] as string,
  ),
);

describe('row level security', () => {
  it('finds tables in the migrations', () => {
    // Защита от «тест зелёный, потому что ничего не нашёл».
    expect(createdTables.length).toBeGreaterThan(0);
  });

  it('enables RLS on every created table', () => {
    const withoutRls = createdTables.filter((table) => !rlsEnabledTables.has(table));

    expect(withoutRls).toEqual([]);
  });

  it('does not enable RLS on tables that were never created', () => {
    const unknown = [...rlsEnabledTables].filter((table) => !createdTables.includes(table));

    expect(unknown).toEqual([]);
  });
});
