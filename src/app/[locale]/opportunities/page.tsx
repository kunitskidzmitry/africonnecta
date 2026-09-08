import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { getAppSession } from '@/lib/auth/session';
import {
  getMembershipInstitutionId,
  listInstitutionOpportunities,
  listPublishedOpportunities,
} from '@/lib/opportunities/load';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, session] = await Promise.all([getTranslations('Opportunities'), getAppSession()]);

  const institutionId =
    session?.role === 'institution_member' && session.status === 'active'
      ? await getMembershipInstitutionId(session.userId)
      : null;

  const [published, mine] = await Promise.all([
    listPublishedOpportunities(),
    institutionId ? listInstitutionOpportunities(institutionId) : Promise.resolve([]),
  ]);

  const canPost = Boolean(institutionId);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('title')}</h1>
          <p className="text-slate-600">{t('subtitle')}</p>
        </div>
        {canPost ? (
          <Link
            href="/opportunities/new"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            {t('postCta')}
          </Link>
        ) : null}
      </div>

      {canPost && mine.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('mineTitle')}</h2>
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            {mine.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/opportunities/${item.id}`}
                  className="flex flex-col gap-1 py-4 hover:bg-slate-50 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                >
                  <span className="font-medium text-slate-900">{item.title}</span>
                  <span className="text-sm text-slate-500">
                    {t(`statuses.${item.status}`)} · {t(`types.${item.type}`)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('boardTitle')}</h2>
        {published.length === 0 ? (
          <p className="text-slate-600">{t('empty')}</p>
        ) : (
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            {published.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/opportunities/${item.id}`}
                  className="flex flex-col gap-1 py-4 hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{item.title}</span>
                  <span className="text-sm text-slate-500">
                    {item.institution?.name ?? '—'} · {t(`types.${item.type}`)} ·{' '}
                    {t(`modes.${item.mode}`)}
                    {item.location ? ` · ${item.location}` : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
