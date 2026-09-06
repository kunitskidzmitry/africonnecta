import 'server-only';

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

/**
 * Клиент со служебным ключом. Обходит RLS полностью.
 *
 * До загрузки файлов в проекте его не было вовсе, и это записано и в README, и в
 * .env.example: «переменная появится только когда возникнет операция, которую иначе
 * не сделать». Операция появилась.
 *
 * §7 требует проверять MIME по сигнатуре содержимого. Проверить содержимое может только
 * тот, у кого байты на руках, — сервер. Но пока запись в бакет разрешена роли
 * authenticated, у браузера ровно те же права: можно не звать наш обработчик и положить
 * что угодно напрямую. Различить наш сервер и браузер можно только тем, чего у браузера
 * нет. Разбор альтернатив — ADR-0008.
 *
 * Ограничения использования, которые нельзя ослаблять без нового ADR:
 *
 * 1. Только запись файлов (src/lib/files/store.ts). Чтение и права — по-прежнему RLS.
 * 2. Право вызывающего проверяется до обращения сюда, а не здесь: этот клиент не знает,
 *    кто пользователь, и знать не должен.
 * 3. Ключ читается напрямую из process.env и не проходит через src/lib/env.ts: тот модуль
 *    лежит в клиентском графе (его импортирует браузерный клиент), и добавление туда
 *    служебной переменной уронило бы проверку схемы прямо в браузере.
 * 4. Имя переменной без префикса NEXT_PUBLIC_. Утечку в бандл механически проверяет CI.
 */
export function createServiceClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Для загрузки файлов нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY. См. .env.example',
    );
  }

  return createSupabaseClient<Database>(url, key, {
    // Сессии у служебного клиента нет и быть не должно: он не представляет пользователя.
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
