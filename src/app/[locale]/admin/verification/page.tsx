import { getTranslations, setRequestLocale } from 'next-intl/server';

import { VerificationQueue } from '@/components/scoring/verification-queue';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/admin/session';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminVerificationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);

  const [t, ta, supabase] = await Promise.all([
    getTranslations('Scoring'),
    getTranslations('Admin'),
    createClient(),
  ]);

  const { data: requests } = await supabase
    .from('verification_requests')
    .select('id, subject_type, subject_id, method, status, evidence, created_at, decision_reason')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-sm text-slate-500 underline hover:text-slate-900">
          {ta('backToAdmin')}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t('verificationTitle')}</h1>
        <p className="text-slate-600">{t('verificationSubtitle')}</p>
      </div>
      <VerificationQueue locale={locale} requests={requests ?? []} />
    </main>
  );
}
