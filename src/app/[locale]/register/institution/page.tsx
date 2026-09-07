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
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 sm:gap-8 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('institutionTitle')}</h1>
        <p className="text-slate-600">{t('institutionSubtitle')}</p>
      </div>

      <InstitutionForm countries={countries} />

      <p className="text-sm text-slate-600">
        {t('alreadyHaveAccount')}{' '}
        <Link href="/login" className="font-semibold text-slate-900 underline">
          {t('signIn')}
        </Link>
      </p>

      <Link href="/register" className="text-sm text-slate-500 underline hover:text-slate-900">
        {t('backToChoice')}
      </Link>
    </main>
  );
}
