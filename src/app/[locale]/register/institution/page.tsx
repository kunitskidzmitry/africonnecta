import { getTranslations, setRequestLocale } from 'next-intl/server';

import { InstitutionForm } from '@/components/register/institution-form';
import { Link } from '@/i18n/navigation';
import { getCountries } from '@/lib/taxonomy';

/** Рендер на каждый запрос: справочник стран читается из базы, см. страницу эксперта. */
export const dynamic = 'force-dynamic';

export default async function InstitutionRegistrationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, countries] = await Promise.all([getTranslations('Register'), getCountries()]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t('institutionTitle')}</h1>
        <p className="text-slate-600">{t('institutionSubtitle')}</p>
      </div>

      <InstitutionForm countries={countries} />

      <Link href="/register" className="text-sm text-slate-500 underline hover:text-slate-900">
        {t('backToChoice')}
      </Link>
    </main>
  );
}
