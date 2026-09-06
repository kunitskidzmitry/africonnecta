import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Landing');

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
        {t('headline')}
      </h1>
      <p className="text-lg text-slate-600">{t('subheadline')}</p>

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
      </div>

      <p className="rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-500">{t('status')}</p>
    </main>
  );
}
