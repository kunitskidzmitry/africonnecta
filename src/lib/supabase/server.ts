import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import type { Database } from '@/lib/database.types';
import { env } from '@/lib/env';

/**
 * Клиент для серверных компонентов, server actions и обработчиков маршрутов.
 *
 * Импорт 'server-only' — предохранитель: если этот модуль случайно попадёт в клиентский
 * граф, сборка упадёт с внятной ошибкой, а не утечёт куки-логика в браузер.
 */
export async function createClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = env();
  const cookieStore = await cookies();

  return createServerClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Серверные компоненты не имеют права писать куки. Это нормальный случай:
          // обновление токена берёт на себя proxy.ts, который выполняется раньше
          // и располагает изменяемым ответом.
        }
      },
    },
  });
}

/**
 * Текущий пользователь или null.
 *
 * Намеренно getUser(), а не getSession(): getSession читает куки без проверки подписи,
 * то есть доверяет данным, которые пришли от клиента. getUser сверяет токен с сервером
 * Supabase. На сервере доверять можно только второму.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}
