import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';

import { routing } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';

/**
 * Переход по ссылке из письма подтверждения.
 *
 * Маршрут живёт под /api намеренно: proxy.ts не подставляет сюда префикс локали,
 * а значит адрес в письме не сломается редиректом. Язык переносится в параметре next.
 *
 * Проверяется token_hash, а не код PKCE: секрет PKCE остаётся в куках устройства,
 * на котором заполняли форму, и письмо, открытое на телефоне, не сработало бы.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  // Параметр next приходит из письма, то есть управляется извне. Берём только путь
  // внутри сайта: иначе ссылка «подтвердите почту» уводила бы на чужой домен вместе
  // со свежей сессией. Ведущий «//» отсекается отдельно — это тоже внешний адрес.
  const requestedNext = searchParams.get('next') ?? '/';
  const isInternal = requestedNext.startsWith('/') && !requestedNext.startsWith('//');
  const next = isInternal ? requestedNext : '/';

  const failureUrl = new URL(`/${localeFrom(next)}/register/failed`, origin);

  if (!tokenHash || !type) {
    return NextResponse.redirect(failureUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    // Просроченная или уже использованная ссылка. Причину пользователю не раскрываем,
    // предлагаем зарегистрироваться заново.
    return NextResponse.redirect(failureUrl);
  }

  return NextResponse.redirect(new URL(next, origin));
}

/** Первый сегмент пути — язык, если он входит в список поддерживаемых. */
function localeFrom(path: string): string {
  const segment = path.split('/')[1] ?? '';

  return (routing.locales as readonly string[]).includes(segment) ? segment : routing.defaultLocale;
}
