import { getTranslations, setRequestLocale } from 'next-intl/server';

import { redirect } from '@/i18n/navigation';
import { signOut } from '@/lib/auth/actions';
import { createClient } from '@/lib/supabase/server';

/** Страница целиком зависит от текущей сессии — заранее её собирать нечего. */
export const dynamic = 'force-dynamic';

/**
 * Экран после подтверждения почты.
 *
 * Он же — доказательство, что цепочка сработала целиком: строка читается публичным
 * ключом через политику users_select_own, то есть пользователь видит собственный профиль
 * и только его. Если бы триггер не создал запись, здесь было бы пусто.
 */
export default async function WelcomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Register');
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: '/register', locale });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role, status')
    .eq('id', user.id)
    .single();

  const roleLabel =
    profile?.role === 'expert' ? t('roleExpert') : profile ? t('roleInstitution') : '—';

  const rows = [
    { label: t('welcomeEmail'), value: user.email ?? '—' },
    { label: t('welcomeRole'), value: roleLabel },
    { label: t('welcomeStatus'), value: profile?.status ?? '—' },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t('welcomeTitle')}</h1>
        <p className="text-slate-600">{t('welcomeBody')}</p>
      </div>

      <dl className="divide-y divide-slate-200 rounded-lg border border-slate-200">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4 px-4 py-3 text-sm">
            <dt className="text-slate-500">{row.label}</dt>
            <dd className="font-medium text-slate-900">{row.value}</dd>
          </div>
        ))}
      </dl>

      <form action={signOut}>
        <input type="hidden" name="locale" value={locale} />
        <button type="submit" className="text-sm text-slate-500 underline hover:text-slate-900">
          {t('signOut')}
        </button>
      </form>
    </main>
  );
}
