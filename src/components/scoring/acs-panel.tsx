'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';

import { disputeAcs, recomputeOwnAcs, type ScoringActionState } from '@/lib/scoring/actions';
import type { StoredAcs } from '@/lib/scoring/load';

const initial: ScoringActionState = { formError: null, ok: false };

const componentKeys = [
  'academic_engagement',
  'geographical_expertise',
  'policy_development',
  'contribution',
  'language_cultural',
] as const;

export function AcsPanel({ locale, score }: { locale: string; score: StoredAcs }) {
  const t = useTranslations('Scoring');
  const te = useTranslations('ScoringErrors');
  const [recomputeState, recomputeAction, recomputePending] = useActionState(
    recomputeOwnAcs,
    initial,
  );
  const [disputeState, disputeAction, disputePending] = useActionState(disputeAcs, initial);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-slate-500">{t('acsTotalLabel')}</p>
        <p className="text-4xl font-bold tracking-tight">{score.total.toFixed(1)}</p>
        <p className="text-sm text-slate-500">
          {t('acsVersion', { version: score.algorithm_version })} ·{' '}
          {new Date(score.computed_at).toLocaleString(locale)}
        </p>
      </div>

      <ul className="divide-y divide-slate-200 border-y border-slate-200">
        {componentKeys.map((key) => {
          const component = score.components[key];
          return (
            <li key={key} className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between">
              <div>
                <p className="font-medium">{t(`components.${key}`)}</p>
                <p className="text-sm text-slate-500">
                  {t('componentMeta', {
                    raw: component.raw.toFixed(1),
                    confidence: component.confidence.toFixed(2),
                  })}
                  {key === 'contribution' && component.local != null && component.diaspora != null
                    ? ` · local ${component.local.toFixed(1)} / diaspora ${component.diaspora.toFixed(1)}`
                    : null}
                </p>
              </div>
              <p className="font-semibold">{component.weighted.toFixed(2)}</p>
            </li>
          );
        })}
      </ul>

      <form action={recomputeAction}>
        <input type="hidden" name="locale" value={locale} />
        <button
          type="submit"
          disabled={recomputePending}
          className="inline-flex min-h-11 items-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {recomputePending ? t('recomputing') : t('recompute')}
        </button>
        {recomputeState.formError ? (
          <p className="mt-2 text-sm text-red-700">{te(recomputeState.formError)}</p>
        ) : null}
        {recomputeState.ok ? (
          <p className="mt-2 text-sm text-emerald-800">{t('recomputeSuccess')}</p>
        ) : null}
      </form>

      <section className="flex flex-col gap-3 border-t border-slate-200 pt-4">
        <h2 className="text-lg font-semibold">{t('disputeTitle')}</h2>
        <p className="text-sm text-slate-600">{t('disputeHint')}</p>
        {disputeState.ok ? (
          <p className="text-sm font-medium text-emerald-800">{t('disputeSuccess')}</p>
        ) : (
          <form action={disputeAction} className="flex flex-col gap-3">
            <input type="hidden" name="locale" value={locale} />
            <textarea
              name="reason"
              required
              rows={3}
              maxLength={2000}
              className="rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900 sm:text-sm"
            />
            {disputeState.formError ? (
              <p className="text-sm text-red-700">{te(disputeState.formError)}</p>
            ) : null}
            <button
              type="submit"
              disabled={disputePending}
              className="inline-flex min-h-11 w-fit items-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:border-slate-900 disabled:opacity-60"
            >
              {disputePending ? t('disputing') : t('disputeSubmit')}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
