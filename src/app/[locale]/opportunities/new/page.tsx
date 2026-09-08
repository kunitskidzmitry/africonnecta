import { getTranslations, setRequestLocale } from 'next-intl/server';

import { CreateOpportunityForm } from '@/components/opportunities/create-opportunity-form';
import { Link, redirect } from '@/i18n/navigation';
import { getAppSession } from '@/lib/auth/session';
import { getMembershipInstitutionId } from '@/lib/opportunities/load';

export const dynamic = 'force-dynamic';

export default async function NewOpportunityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, session] = await Promise.all([getTranslations('Opportunities'), getAppSession()]);

  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }

  const institutionId = await getMembershipInstitutionId(session.userId);
  if (!institutionId) {
    redirect({ href: '/opportunities', locale });
  }

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-2">
        <Link
          href="/opportunities"
          className="text-sm text-slate-500 underline hover:text-slate-900"
        >
          {t('backToBoard')}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t('newTitle')}</h1>
        <p className="text-slate-600">{t('newSubtitle')}</p>
      </div>

      <CreateOpportunityForm locale={locale} />
    </main>
  );
}
