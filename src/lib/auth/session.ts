import 'server-only';

import type { User } from '@supabase/supabase-js';
import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';

export type AppRole = 'expert' | 'institution_member' | 'admin';
export type AppStatus = 'pending' | 'active' | 'suspended';

export type AppSession = {
  userId: string;
  email: string;
  role: AppRole;
  status: AppStatus;
  expertId: string | null;
};

/**
 * Сессия приложения: auth.users + public.users + (если есть) профиль эксперта.
 *
 * getUser(), не getSession(): на сервере токен обязан быть проверен у Supabase,
 * а не принят из куки как есть. См. createClient / getCurrentUser.
 *
 * cache() из React снимает дубли внутри одного запроса. За рендер страницы эксперта
 * сессия нужна трижды — шапке, самой странице и загрузчику профиля, — а это три
 * обращения к GoTrue плюс шесть запросов к базе. При 150–180 мс до Франкфурта (§2.2)
 * такая экономия заметна пользователю.
 *
 * Мемоизация верна ровно потому, что внутри запроса сессия неизменна. Действие,
 * которое меняет саму сессию (вход, выход), обязано либо уводить редиректом, либо
 * читать пользователя напрямую через loadAppSession — см. signIn.
 */
export const getAppSession = cache(async (): Promise<AppSession | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return loadAppSession(supabase, user);
});

/**
 * То же самое для уже известного пользователя и без мемоизации.
 *
 * Нужна там, где getUser() был бы лишним обращением к GoTrue (вход только что вернул
 * User) или где кэш соврал бы, потому что сессия меняется прямо в этом запросе.
 */
export async function loadAppSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: User,
): Promise<AppSession | null> {
  const { data: profile } = await supabase
    .from('users')
    .select('role, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) return null;

  let expertId: string | null = null;

  if (profile.role === 'expert') {
    const { data: expert } = await supabase
      .from('experts')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    expertId = expert?.id ?? null;
  }

  return {
    userId: user.id,
    email: user.email ?? '',
    role: profile.role,
    status: profile.status,
    expertId,
  };
}

export function homeFor(session: AppSession): '/profile' | '/welcome' {
  return session.role === 'expert' && session.expertId ? '/profile' : '/welcome';
}
