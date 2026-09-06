import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ExpertForm } from '@/components/register/expert-form';
import { Link } from '@/i18n/navigation';
import { getCountries } from '@/lib/taxonomy';

/**
 * Страница рендерится на каждый запрос.
 *
 * Иначе Next попытается собрать её заранее и обратится к базе прямо во время сборки:
 * тогда `npm run build` перестанет работать без поднятого Supabase, а список стран
 * застынет на момент сборки. Справочник обязан отражать текущее состояние базы.
 */
export const dynamic = 'force-dynamic';

export default async function ExpertRegistrationPage({
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
        <h1 className="text-3xl font-bold tracking-tight">{t('expertTitle')}</h1>
        <p className="text-slate-600">{t('expertSubtitle')}</p>
      </div>

      <ExpertForm countries={countries} />

      <Link href="/register" className="text-sm text-slate-500 underline hover:text-slate-900">
        {t('backToChoice')}
      </Link>
    </main>
  );
}
