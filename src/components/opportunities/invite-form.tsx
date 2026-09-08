'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';

import { inviteExpert, type OpportunityActionState } from '@/lib/opportunities/actions';

const initial: OpportunityActionState = { fieldErrors: {}, formError: null, ok: false };

export function InviteForm({ locale, opportunityId }: { locale: string; opportunityId: string }) {
  const t = useTranslations('Opportunities');
  const te = useTranslations('OpportunityErrors');
  const [state, action, pending] = useActionState(inviteExpert, initial);

  if (state.ok) {
    return <p className="text-sm font-medium text-emerald-800">{t('inviteSuccess')}</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="opportunityId" value={opportunityId} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t('fieldExpertId')}</span>
        <input
          name="expertId"
          required
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="rounded-md border border-slate-300 px-3 py-2.5 font-mono text-base outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 sm:text-sm"
        />
        <span className="text-slate-500">{t('expertIdHint')}</span>
        {state.fieldErrors.expertId ? (
          <span className="text-sm text-red-700">{te(state.fieldErrors.expertId)}</span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t('fieldInviteMessage')}</span>
        <textarea
          name="message"
          rows={3}
          maxLength={2000}
          className="rounded-md border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 sm:text-sm"
        />
      </label>

      {state.formError ? <p className="text-sm text-red-700">{te(state.formError)}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-900 hover:border-slate-900 disabled:opacity-60 sm:w-auto"
      >
        {pending ? t('inviting') : t('inviteSubmit')}
      </button>
    </form>
  );
}
