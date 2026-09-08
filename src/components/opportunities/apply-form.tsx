'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';

import { applyToOpportunity, type OpportunityActionState } from '@/lib/opportunities/actions';

const initial: OpportunityActionState = { fieldErrors: {}, formError: null, ok: false };

export function ApplyForm({ locale, opportunityId }: { locale: string; opportunityId: string }) {
  const t = useTranslations('Opportunities');
  const te = useTranslations('OpportunityErrors');
  const [state, action, pending] = useActionState(applyToOpportunity, initial);

  if (state.ok) {
    return <p className="text-sm font-medium text-emerald-800">{t('applySuccess')}</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="opportunityId" value={opportunityId} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t('fieldCoverLetter')}</span>
        <textarea
          name="coverLetter"
          rows={4}
          maxLength={5000}
          className="rounded-md border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 sm:text-sm"
        />
        {state.fieldErrors.coverLetter ? (
          <span className="text-sm text-red-700">{te(state.fieldErrors.coverLetter)}</span>
        ) : null}
      </label>

      {state.formError ? <p className="text-sm text-red-700">{te(state.formError)}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60 sm:w-auto"
      >
        {pending ? t('applying') : t('applySubmit')}
      </button>
    </form>
  );
}
