import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AcsPanel } from '@/components/scoring/acs-panel';
import { Link, redirect } from '@/i18n/navigation';
import { getAppSession } from '@/lib/auth/session';
import { getLatestAcs, recomputeAndStoreAcs } from '@/lib/scoring/load';

export const dynamic = 'force-dynamic';

export default async function AcsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, session] = await Promise.all([getTranslations('Scoring'), getAppSession()]);

  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }
  if (session.role !== 'expert' || !session.expertId) {
    redirect({ href: '/welcome', locale });
  }

  let score = await getLatestAcs(session.expertId);
  if (!score) {
    score = await recomputeAndStoreAcs(session.expertId, session.userId);
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-2">
        <Link href="/profile" className="text-sm text-slate-500 underline hover:text-slate-900">
          {t('backToProfile')}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t('acsTitle')}</h1>
        <p className="text-slate-600">{t('acsSubtitle')}</p>
      </div>
      <AcsPanel locale={locale} score={score} />
    </main>
  );
}
