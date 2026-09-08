'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';

import { startConversation, type MessagingActionState } from '@/lib/messaging/actions';

const initial: MessagingActionState = { fieldErrors: {}, formError: null, ok: false };

export function StartConversationForm({
  locale,
  mode,
  expertId,
  opportunityId,
}: {
  locale: string;
  mode: 'institution' | 'expert';
  expertId?: string;
  opportunityId?: string;
}) {
  const t = useTranslations('Messaging');
  const te = useTranslations('MessagingErrors');
  const [state, action, pending] = useActionState(startConversation, initial);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="locale" value={locale} />
      {opportunityId ? <input type="hidden" name="opportunityId" value={opportunityId} /> : null}
      {mode === 'expert' && expertId ? (
        <input type="hidden" name="expertId" value={expertId} />
      ) : null}

      {mode === 'institution' ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('fieldExpertId')}</span>
          <input
            name="expertId"
            required
            defaultValue={expertId ?? ''}
            readOnly={Boolean(expertId)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="rounded-md border border-slate-300 px-3 py-2.5 font-mono text-base outline-none focus:border-slate-900 sm:text-sm"
          />
          {state.fieldErrors.expertId ? (
            <span className="text-sm text-red-700">{te(state.fieldErrors.expertId)}</span>
          ) : null}
        </label>
      ) : null}

      {mode === 'expert' && !opportunityId ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('fieldOpportunityId')}</span>
          <input
            name="opportunityId"
            required
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="rounded-md border border-slate-300 px-3 py-2.5 font-mono text-base outline-none focus:border-slate-900 sm:text-sm"
          />
          {state.fieldErrors.opportunityId ? (
            <span className="text-sm text-red-700">{te(state.fieldErrors.opportunityId)}</span>
          ) : null}
        </label>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t('fieldBody')}</span>
        <textarea
          name="body"
          required
          rows={4}
          maxLength={5000}
          className="rounded-md border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 sm:text-sm"
        />
        {state.fieldErrors.body ? (
          <span className="text-sm text-red-700">{te(state.fieldErrors.body)}</span>
        ) : null}
      </label>

      {state.formError ? <p className="text-sm text-red-700">{te(state.formError)}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
      >
        {pending ? t('sending') : t('startSubmit')}
      </button>
    </form>
  );
}
