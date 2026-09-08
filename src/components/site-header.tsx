import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { signOut } from '@/lib/auth/actions';
import { getAppSession } from '@/lib/auth/session';
import { countUnreadNotifications } from '@/lib/messaging/load';

export async function SiteHeader() {
  const locale = await getLocale();
  const t = await getTranslations('Header');
  const session = await getAppSession();
  const active = session?.status === 'active' ? session : null;
  const unread = active ? await countUnreadNotifications() : 0;

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:h-14 sm:px-6 sm:py-0">
        <Link href="/" className="font-semibold tracking-tight">
          {t('home')}
        </Link>

        <nav className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm sm:gap-x-4">
          <Link
            href="/search"
            className="inline-flex min-h-10 items-center text-slate-600 hover:text-slate-900"
          >
            {t('search')}
          </Link>
          <Link
            href="/opportunities"
            className="inline-flex min-h-10 items-center text-slate-600 hover:text-slate-900"
          >
            {t('opportunities')}
          </Link>

          {active ? (
            <>
              <Link
                href="/messages"
                className="inline-flex min-h-10 items-center text-slate-600 hover:text-slate-900"
              >
                {t('messages')}
              </Link>
              <Link
                href="/notifications"
                className="inline-flex min-h-10 items-center gap-1.5 text-slate-600 hover:text-slate-900"
              >
                {t('notifications')}
                {unread > 0 ? (
                  <span
                    className="inline-flex min-w-5 items-center justify-center rounded-full bg-slate-900 px-1.5 text-xs font-semibold text-white"
                    aria-label={t('unreadBadge', { count: unread })}
                  >
                    {unread > 99 ? '99+' : unread}
                  </span>
                ) : null}
              </Link>
              {active.role === 'expert' && active.expertId ? (
                <>
                  <Link
                    href="/profile"
                    className="inline-flex min-h-10 items-center font-medium text-slate-900 hover:underline"
                  >
                    {t('profile')}
                  </Link>
                  <Link
                    href="/invitations"
                    className="inline-flex min-h-10 items-center text-slate-600 hover:text-slate-900"
                  >
                    {t('invitations')}
                  </Link>
                </>
              ) : (
                <Link
                  href="/welcome"
                  className="inline-flex min-h-10 items-center font-medium text-slate-900 hover:underline"
                >
                  {t('account')}
                </Link>
              )}
              <form action={signOut}>
                <input type="hidden" name="locale" value={locale} />
                <button
                  type="submit"
                  className="inline-flex min-h-10 items-center text-slate-500 underline hover:text-slate-900"
                >
                  {t('signOut')}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex min-h-10 items-center text-slate-600 hover:text-slate-900"
              >
                {t('signIn')}
              </Link>
              <Link
                href="/register"
                className="inline-flex min-h-10 items-center rounded-md bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-700"
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
