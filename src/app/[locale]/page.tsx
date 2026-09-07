import { getTranslations, setRequestLocale } from 'next-intl/server';

import { getPathname, Link } from '@/i18n/navigation';
import { SEARCH_PARAMS } from '@/lib/search/query';

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Landing');

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-5xl">
        {t('headline')}
      </h1>
      <p className="text-base text-slate-600 sm:text-lg">{t('subheadline')}</p>

      {/* Та же форма method="get", что и на странице поиска: заполненный здесь запрос
          просто открывает /search с этим параметром. Отдельного кода не появляется. */}
      <form
        method="get"
        action={getPathname({ href: '/search', locale })}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <label htmlFor="landing-q" className="sr-only">
          {t('searchAction')}
        </label>
        <input
          id="landing-q"
          name={SEARCH_PARAMS.term}
          type="search"
          placeholder={t('searchPlaceholder')}
          className="w-full rounded-md border border-slate-300 px-4 py-3 text-base outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 sm:py-2.5 sm:text-sm"
        />
        <button
          type="submit"
          className="w-full shrink-0 rounded-md bg-slate-900 px-5 py-3 text-base font-semibold text-white hover:bg-slate-700 sm:w-auto sm:py-2.5 sm:text-sm"
        >
          {t('searchAction')}
        </button>
      </form>

      {/* Обе стороны маркетплейса представлены равноправно: сторона экспертов
          наполняется тяжелее, и прятать её вход за меню нельзя (§10, холодный старт). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link
          href="/register/expert"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          {t('joinAsExpert')}
        </Link>
        <Link
          href="/register/institution"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-900 hover:border-slate-900"
        >
          {t('joinAsInstitution')}
        </Link>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold text-slate-700 underline hover:text-slate-900"
        >
          {t('signIn')}
        </Link>
      </div>
    </main>
  );
}
