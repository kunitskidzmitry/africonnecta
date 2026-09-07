import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

export default async function ConfirmationFailedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Register');

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center gap-4 px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-2xl font-bold tracking-tight">{t('failedTitle')}</h1>
      <p className="leading-relaxed text-slate-600">{t('failedBody')}</p>
      <Link
        href="/register"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 sm:w-auto"
      >
        {t('failedCta')}
      </Link>
    </main>
  );
}
