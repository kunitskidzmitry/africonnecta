'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none ' +
  'focus:border-slate-900 focus:ring-1 focus:ring-slate-900 ' +
  'aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus:ring-red-500 ' +
  'sm:py-2 sm:text-sm';

type FieldProps = {
  name: string;
  label: string;
  /** Ключ из каталога RegisterErrors. Перевод выполняется здесь, а не в форме. */
  errorKey?: string | undefined;
  hint?: string | undefined;
  optional?: boolean;
  children: (props: {
    id: string;
    name: string;
    className: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactNode;
};

/**
 * Обёртка поля формы: подпись, подсказка, сообщение об ошибке.
 *
 * Связка через aria-describedby и aria-invalid обязательна: без неё скринридер
 * не сообщит, почему поле отклонено, и форма остаётся недоступной.
 */
export function Field({ name, label, errorKey, hint, optional, children }: FieldProps) {
  const t = useTranslations('RegisterErrors');
  const tRegister = useTranslations('Register');

  const errorId = errorKey ? `${name}-error` : undefined;
  const hintId = hint ? `${name}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-slate-700">
        {label}
        {optional ? (
          <span className="ml-1.5 font-normal text-slate-400">({tRegister('optional')})</span>
        ) : null}
      </label>

      {children({
        id: name,
        name,
        className: inputClass,
        'aria-invalid': Boolean(errorKey),
        'aria-describedby': describedBy,
      })}

      {hint ? (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}

      {errorKey ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-red-600">
          {t(errorKey)}
        </p>
      ) : null}
    </div>
  );
}
