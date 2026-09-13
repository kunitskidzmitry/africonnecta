'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';

import { decideVerificationAction, type ScoringActionState } from '@/lib/scoring/actions';

const initial: ScoringActionState = { formError: null, ok: false };

type RequestRow = {
  id: string;
  subject_type: string;
  subject_id: string;
  method: string;
  status: string;
  evidence: unknown;
  created_at: string;
  decision_reason: string | null;
};

export function VerificationQueue({
  locale,
  requests,
}: {
  locale: string;
  requests: RequestRow[];
}) {
  const t = useTranslations('Scoring');
  const te = useTranslations('ScoringErrors');
  const [state, action, pending] = useActionState(decideVerificationAction, initial);

  if (requests.length === 0) {
    return <p className="text-slate-600">{t('verificationEmpty')}</p>;
  }

  return (
    <ul className="flex flex-col gap-6">
      {requests.map((request) => (
        <li key={request.id} className="flex flex-col gap-3 border-b border-slate-200 pb-6">
          <div className="flex flex-col gap-1">
            <p className="font-medium">
              {t(`subjectTypes.${request.subject_type}`)} · {request.status}
            </p>
            <p className="font-mono text-xs text-slate-500">{request.subject_id}</p>
            <p className="text-sm text-slate-600">
              {t(`methods.${request.method}`)} ·{' '}
              {new Date(request.created_at).toLocaleString(locale)}
            </p>
            {request.decision_reason ? (
              <p className="text-sm text-slate-600">{request.decision_reason}</p>
            ) : null}
          </div>

          {request.status === 'pending' ? (
            <form action={action} className="flex flex-col gap-2">
              <input type="hidden" name="requestId" value={request.id} />
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{t('fieldReason')}</span>
                <textarea
                  name="reason"
                  required
                  rows={2}
                  className="rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900 sm:text-sm"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  name="decision"
                  value="approve"
                  disabled={pending}
                  className="inline-flex min-h-10 items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {t('approve')}
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="reject"
                  disabled={pending}
                  className="inline-flex min-h-10 items-center rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium disabled:opacity-60"
                >
                  {t('reject')}
                </button>
              </div>
              {state.formError ? (
                <p className="text-sm text-red-700">{te(state.formError)}</p>
              ) : null}
            </form>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
