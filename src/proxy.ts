import { createServerClient } from '@supabase/ssr';
import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';

import { env } from '@/lib/env';
import { routing } from '@/i18n/routing';

// Next 16 переименовал соглашение `middleware.ts` -> `proxy.ts`.
// next-intl по-прежнему отдаёт обработчик через `next-intl/middleware`.
const handleI18n = createMiddleware(routing);

/**
 * Здесь делается две вещи, и порядок важен.
 *
 * Сначала next-intl решает, куда идёт запрос: он может вернуть редирект (`/` -> `/en`).
 * Затем на этом же ответе обновляется сессия Supabase.
 *
 * Обновлять токен обязательно именно тут. Серверные компоненты писать куки не могут,
 * поэтому если не продлить токен в proxy, через час пользователя выбросит из аккаунта
 * без всякой причины. Вызов getUser() — не проверка ради проверки: он и выполняет
 * продление, складывая свежие куки в ответ.
 */
export default async function proxy(request: NextRequest) {
  const response = handleI18n(request);

  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = env();

  const supabase = createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Пропускаем API, статику и файлы с расширением.
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
