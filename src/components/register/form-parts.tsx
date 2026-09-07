'use client';

import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';

export function SubmitButton({
  label,
  pendingLabel,
}: {
  label?: string;
  pendingLabel?: string;
} = {}) {
  const t = useTranslations('Register');
  // useFormStatus читает состояние ближайшей формы выше по дереву, поэтому кнопка
  // обязана быть отдельным компонентом внутри <form>, а не частью самой формы.
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 w-full rounded-md bg-slate-900 px-4 py-2.5 text-base font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:text-sm"
    >
      {pending ? (pendingLabel ?? t('submitting')) : (label ?? t('submit'))}
    </button>
  );
}

export function FormError({ errorKey }: { errorKey: string | null }) {
  const t = useTranslations('RegisterErrors');

  if (!errorKey) return null;

  return (
    <p
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {t(errorKey)}
    </p>
  );
}

export function SectionHeading({ children }: { children: string }) {
  return (
    <h2 className="border-b border-slate-200 pb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
      {children}
    </h2>
  );
}

export type Country = { id: number; iso2: string; name: string };
