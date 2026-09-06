import { getTranslations, setRequestLocale } from 'next-intl/server';

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
      <p className="rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-500">{t('status')}</p>
    </main>
  );
}
