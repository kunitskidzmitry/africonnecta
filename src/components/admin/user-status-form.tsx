'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';

import { setUserStatusAction, type AdminActionState } from '@/lib/admin/actions';

const initial: AdminActionState = { formError: null, ok: false };

export function UserStatusForm({ userId, status }: { userId: string; status: string }) {
  const t = useTranslations('Admin');
  const te = useTranslations('AdminErrors');
  const [state, action, pending] = useActionState(setUserStatusAction, initial);
  const nextStatus = status === 'suspended' ? 'active' : 'suspended';

  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value={nextStatus} />
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <span className="font-medium">{t('fieldReason')}</span>
        <input
          name="reason"
          required
          maxLength={500}
          className="rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900 sm:text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? t('saving') : nextStatus === 'suspended' ? t('suspend') : t('unsuspend')}
      </button>
      {state.formError ? (
        <p className="text-sm text-red-700 sm:basis-full" role="alert">
          {te(state.formError)}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-sm text-slate-600 sm:basis-full">{t('statusUpdated')}</p>
      ) : null}
    </form>
  );
}
