import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { loadReportedConversations } from '@/lib/admin/load';
import { requireAdmin } from '@/lib/admin/session';

export const dynamic = 'force-dynamic';

export default async function AdminReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);

  const [t, reports] = await Promise.all([getTranslations('Admin'), loadReportedConversations()]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-sm text-slate-500 underline hover:text-slate-900">
          {t('backToAdmin')}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t('reportsTitle')}</h1>
        <p className="text-slate-600">{t('reportsSubtitle')}</p>
      </div>

      {reports.length === 0 ? (
        <p className="text-slate-600">{t('reportsEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {reports.map((report) => (
            <li key={report.id} className="flex flex-col gap-1 border-b border-slate-200 pb-4">
              <Link
                href={`/messages/${report.id}`}
                className="font-medium text-slate-900 underline hover:text-slate-700"
              >
                {t('openConversation')}
              </Link>
              <p className="font-mono text-xs text-slate-500">{report.id}</p>
              <p className="text-sm text-slate-600">
                {new Date(report.reported_at).toLocaleString(locale)}
              </p>
              {report.report_reason ? (
                <p className="text-sm text-slate-700">{report.report_reason}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
