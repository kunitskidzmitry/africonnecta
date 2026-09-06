import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

/**
 * Параметры локального стека Supabase — в одном месте.
 *
 * Раньше каждый файл объявлял их заново, и в одной из копий публичный ключ оказался
 * с опечаткой в заголовке JWT. Тесты при этом прошли: локальный шлюз ключ не проверяет.
 * На стенде с настоящей проверкой такой тест упал бы на входе в систему, а причина
 * была бы совсем не там, где её стали бы искать.
 *
 * Значения не секретны: `supabase start` поднимает стек с фиксированными
 * демонстрационными параметрами, одинаковыми на любой машине.
 */
export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';

export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

export const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

/** Пароль всех засеянных учётных записей (supabase/seed.sql). */
export const SEED_PASSWORD = 'password123';

/**
 * Клиент без сессии — так систему видит случайный посетитель.
 *
 * Типизирован схемой базы: тест, обратившийся к переименованной колонке, падает
 * на проверке типов, а не превращается в тихо проходящую проверку пустого ответа.
 */
export function anon(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Клиент засеянного пользователя: настоящий вход паролем, публичный ключ. */
export async function signInAs(
  email: string,
  password: string = SEED_PASSWORD,
): Promise<SupabaseClient<Database>> {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) throw new Error(`Не удалось войти как ${email}: ${error.message}`);

  return client;
}
