import { getTranslations, setRequestLocale } from 'next-intl/server';

import { getPathname, Link } from '@/i18n/navigation';
import { SEARCH_PARAMS } from '@/lib/search/query';

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Landing');

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
        {t('headline')}
      </h1>
      <p className="text-lg text-slate-600">{t('subheadline')}</p>

      {/* Та же форма method="get", что и на странице поиска: заполненный здесь запрос
          просто открывает /search с этим параметром. Отдельного кода не появляется. */}
      <form method="get" action={getPathname({ href: '/search', locale })} className="flex gap-2">
        <label htmlFor="landing-q" className="sr-only">
          {t('searchAction')}
        </label>
        <input
          id="landing-q"
          name={SEARCH_PARAMS.term}
          type="search"
          placeholder={t('searchPlaceholder')}
          className="w-full rounded-md border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          {t('searchAction')}
        </button>
      </form>

      {/* Обе стороны маркетплейса представлены равноправно: сторона экспертов
          наполняется тяжелее, и прятать её вход за меню нельзя (§10, холодный старт). */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/register/expert"
          className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          {t('joinAsExpert')}
        </Link>
        <Link
          href="/register/institution"
          className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-900 hover:border-slate-900"
        >
          {t('joinAsInstitution')}
        </Link>
        <Link
          href="/login"
          className="rounded-md px-5 py-2.5 text-sm font-semibold text-slate-700 underline hover:text-slate-900"
        >
          {t('signIn')}
        </Link>
      </div>
    </main>
  );
}
