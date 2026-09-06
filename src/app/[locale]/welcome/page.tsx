import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link, redirect } from '@/i18n/navigation';
import { signOut } from '@/lib/auth/actions';
import { getAppSession } from '@/lib/auth/session';

/** Страница целиком зависит от текущей сессии — заранее её собирать нечего. */
export const dynamic = 'force-dynamic';

/**
 * Экран после подтверждения почты и запасной домашний экран
 * для институции и администратора.
 */
export default async function WelcomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Register');
  const session = await getAppSession();

  if (!session) {
    redirect({ href: '/login', locale });
  }

  const roleLabel =
    session.role === 'expert'
      ? t('roleExpert')
      : session.role === 'admin'
        ? t('roleAdmin')
        : t('roleInstitution');

  const rows = [
    { label: t('welcomeEmail'), value: session.email || '—' },
    { label: t('welcomeRole'), value: roleLabel },
    { label: t('welcomeStatus'), value: session.status },
  ];

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-16">
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

      {session.role === 'expert' && session.expertId ? (
        <Link
          href="/profile"
          className="rounded-md bg-slate-900 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-slate-700"
        >
          {t('continueToProfile')}
        </Link>
      ) : null}

      <form action={signOut}>
        <input type="hidden" name="locale" value={locale} />
        <button type="submit" className="text-sm text-slate-500 underline hover:text-slate-900">
          {t('signOut')}
        </button>
      </form>
    </main>
  );
}
