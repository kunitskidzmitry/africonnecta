import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { Link, redirect } from '@/i18n/navigation';
import { getAppSession } from '@/lib/auth/session';
import { getMembershipInstitutionId, getOpportunity } from '@/lib/opportunities/load';
import { runMatchForOpportunityForm } from '@/lib/scoring/actions';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function OpportunityMatchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { locale, id } = await params;
  const { run: runId } = await searchParams;
  setRequestLocale(locale);

  const [t, session, opportunity] = await Promise.all([
    getTranslations('Scoring'),
    getAppSession(),
    getOpportunity(id),
  ]);

  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }
  if (!opportunity) notFound();

  const institutionId = await getMembershipInstitutionId(session.userId);
  if (!institutionId || institutionId !== opportunity.institution_id) {
    redirect({ href: `/opportunities/${id}`, locale });
  }

  const supabase = await createClient();
  let results: Array<{
    rank: number;
    total_score: number;
    factors: Record<string, number>;
    expert: { first_name: string; last_name: string; title: string | null } | null;
  }> = [];

  if (runId) {
    const { data } = await supabase
      .from('match_results')
      .select('rank, total_score, factors, expert:experts!inner(first_name, last_name, title)')
      .eq('match_run_id', runId)
      .order('rank', { ascending: true });

    results = (data ?? []).map((row) => ({
      rank: row.rank,
      total_score: Number(row.total_score),
      factors: (row.factors ?? {}) as Record<string, number>,
      expert: Array.isArray(row.expert) ? (row.expert[0] ?? null) : row.expert,
    }));
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-2">
        <Link
          href={`/opportunities/${id}`}
          className="text-sm text-slate-500 underline hover:text-slate-900"
        >
          {t('backToOpportunity')}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t('matchesTitle')}</h1>
        <p className="text-slate-600">{opportunity.title}</p>
        <p className="text-sm text-slate-500">{t('matchesSubtitle')}</p>
      </div>

      <form action={runMatchForOpportunityForm}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="opportunityId" value={id} />
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          {t('runMatch')}
        </button>
      </form>

      {!runId ? (
        <p className="text-slate-600">{t('matchesEmpty')}</p>
      ) : results.length === 0 ? (
        <p className="text-slate-600">{t('matchesNoResults')}</p>
      ) : (
        <ol className="divide-y divide-slate-200 border-y border-slate-200">
          {results.map((row) => (
            <li key={row.rank} className="flex flex-col gap-1 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  #{row.rank}{' '}
                  {row.expert ? `${row.expert.first_name} ${row.expert.last_name}` : '—'}
                  {row.expert?.title ? ` · ${row.expert.title}` : ''}
                </span>
                <span className="font-semibold">{(row.total_score * 100).toFixed(1)}%</span>
              </div>
              <p className="text-sm text-slate-500">
                {t('factorsLine', {
                  expertise: ((row.factors.expertise ?? 0) * 100).toFixed(0),
                  acs: ((row.factors.african_context_score ?? 0) * 100).toFixed(0),
                  research: ((row.factors.research_relevance ?? 0) * 100).toFixed(0),
                  language: ((row.factors.language_match ?? 0) * 100).toFixed(0),
                  availability: ((row.factors.availability ?? 0) * 100).toFixed(0),
                })}
              </p>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
