import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/admin/session';
import { loadEmptySearchRates } from '@/lib/admin/load';

export const dynamic = 'force-dynamic';

function pct(rate: number | null): string {
  if (rate == null) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

export default async function AdminHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);

  const [t, rates] = await Promise.all([getTranslations('Admin'), loadEmptySearchRates(30)]);

  const links = [
    { href: '/admin/verification', title: t('navVerification'), body: t('navVerificationHint') },
    { href: '/admin/users', title: t('navUsers'), body: t('navUsersHint') },
    { href: '/admin/reports', title: t('navReports'), body: t('navReportsHint') },
  ] as const;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-slate-600">{t('subtitle')}</p>
      </div>

      <section className="flex flex-col gap-3 border-y border-slate-200 py-6">
        <h2 className="text-lg font-semibold">{t('emptySearchTitle')}</h2>
        <p className="text-sm text-slate-600">
          {t('emptySearchSubtitle', { days: rates.windowDays })}
        </p>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-slate-500">{t('totalSearches')}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{rates.totalSearches}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">{t('exactEmptyRate')}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{pct(rates.exactEmptyRate)}</dd>
            <dd className="text-xs text-slate-500">
              {t('emptyCount', { count: rates.exactEmptyCount })}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">{t('finalEmptyRate')}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{pct(rates.finalEmptyRate)}</dd>
            <dd className="text-xs text-slate-500">
              {t('emptyCount', { count: rates.finalEmptyCount })}
            </dd>
          </div>
        </dl>
      </section>

      <ul className="flex flex-col gap-4">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="flex flex-col gap-1 border-b border-slate-200 pb-4 hover:text-slate-700"
            >
              <span className="font-medium text-slate-900">{link.title}</span>
              <span className="text-sm text-slate-600">{link.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
