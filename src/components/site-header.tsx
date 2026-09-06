import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { signOut } from '@/lib/auth/actions';
import { getAppSession } from '@/lib/auth/session';

export async function SiteHeader() {
  const locale = await getLocale();
  const t = await getTranslations('Header');
  const session = await getAppSession();
  const active = session?.status === 'active' ? session : null;

  return (
    <header className="border-b border-slate-200">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link href="/" className="font-semibold tracking-tight">
          {t('home')}
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          <Link href="/search" className="text-slate-600 hover:text-slate-900">
            {t('search')}
          </Link>

          {active ? (
            <>
              {active.role === 'expert' && active.expertId ? (
                <Link href="/profile" className="font-medium text-slate-900 hover:underline">
                  {t('profile')}
                </Link>
              ) : (
                <Link href="/welcome" className="font-medium text-slate-900 hover:underline">
                  {t('account')}
                </Link>
              )}
              <form action={signOut}>
                <input type="hidden" name="locale" value={locale} />
                <button type="submit" className="text-slate-500 underline hover:text-slate-900">
                  {t('signOut')}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="text-slate-600 hover:text-slate-900">
                {t('signIn')}
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-700"
              >
                {t('register')}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
