'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';

import { reportConversation, type MessagingActionState } from '@/lib/messaging/actions';

const initial: MessagingActionState = { fieldErrors: {}, formError: null, ok: false };

export function ReportConversationForm({
  locale,
  conversationId,
}: {
  locale: string;
  conversationId: string;
}) {
  const t = useTranslations('Messaging');
  const te = useTranslations('MessagingErrors');
  const [state, action, pending] = useActionState(reportConversation, initial);

  if (state.ok) {
    return <p className="text-sm font-medium text-emerald-800">{t('reportSuccess')}</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="conversationId" value={conversationId} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t('fieldReportReason')}</span>
        <textarea
          name="reason"
          required
          rows={2}
          maxLength={2000}
          className="rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900 sm:text-sm"
        />
      </label>
      {state.formError ? <p className="text-sm text-red-700">{te(state.formError)}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-10 items-center self-start rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:border-slate-900 disabled:opacity-60"
      >
        {pending ? t('reporting') : t('reportSubmit')}
      </button>
    </form>
  );
}
