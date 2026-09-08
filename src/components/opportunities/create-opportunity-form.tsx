'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';

import { createOpportunity, type OpportunityActionState } from '@/lib/opportunities/actions';
import { opportunityModes, opportunityTypes } from '@/lib/opportunities/schema';

const initial: OpportunityActionState = { fieldErrors: {}, formError: null, ok: false };

export function CreateOpportunityForm({ locale }: { locale: string }) {
  const t = useTranslations('Opportunities');
  const te = useTranslations('OpportunityErrors');
  const [state, action, pending] = useActionState(createOpportunity, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t('fieldTitle')}</span>
        <input
          name="title"
          required
          maxLength={200}
          className="rounded-md border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 sm:text-sm"
        />
        {state.fieldErrors.title ? (
          <span className="text-sm text-red-700">{te(state.fieldErrors.title)}</span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t('fieldDescription')}</span>
        <textarea
          name="description"
          required
          rows={6}
          maxLength={10000}
          className="rounded-md border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 sm:text-sm"
        />
        {state.fieldErrors.description ? (
          <span className="text-sm text-red-700">{te(state.fieldErrors.description)}</span>
        ) : null}
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('fieldType')}</span>
          <select
            name="type"
            required
            defaultValue=""
            className="rounded-md border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 sm:text-sm"
          >
            <option value="" disabled>
              {t('selectPlaceholder')}
            </option>
            {opportunityTypes.map((type) => (
              <option key={type} value={type}>
                {t(`types.${type}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('fieldMode')}</span>
          <select
            name="mode"
            required
            defaultValue=""
            className="rounded-md border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 sm:text-sm"
          >
            <option value="" disabled>
              {t('selectPlaceholder')}
            </option>
            {opportunityModes.map((mode) => (
              <option key={mode} value={mode}>
                {t(`modes.${mode}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t('fieldLocation')}</span>
        <input
          name="location"
          maxLength={200}
          className="rounded-md border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 sm:text-sm"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t('fieldDuration')}</span>
        <input
          name="duration"
          maxLength={100}
          className="rounded-md border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 sm:text-sm"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="publishNow" className="size-4" />
        <span>{t('publishNow')}</span>
      </label>

      {state.formError ? <p className="text-sm text-red-700">{te(state.formError)}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
      >
        {pending ? t('creating') : t('createSubmit')}
      </button>
    </form>
  );
}
