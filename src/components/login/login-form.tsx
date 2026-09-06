'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { Field } from '@/components/register/field';
import { FormError, SubmitButton } from '@/components/register/form-parts';
import { Link } from '@/i18n/navigation';
import { signIn } from '@/lib/auth/actions';
import { emptyLoginState } from '@/lib/auth/login-state';

export function LoginForm() {
  const t = useTranslations('Login');
  const locale = useLocale();
  const [state, formAction] = useActionState(signIn, emptyLoginState);

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="locale" value={locale} />

      <FormError errorKey={state.formError} />

      <Field name="email" label={t('fieldEmail')} errorKey={state.fieldErrors.email}>
        {(props) => (
          <input {...props} type="email" autoComplete="email" defaultValue={state.email} required />
        )}
      </Field>

      <Field name="password" label={t('fieldPassword')} errorKey={state.fieldErrors.password}>
        {(props) => <input {...props} type="password" autoComplete="current-password" required />}
      </Field>

      <SubmitButton label={t('submit')} pendingLabel={t('submitting')} />

      <p className="text-sm text-slate-600">
        {t('noAccount')}{' '}
        <Link href="/register" className="font-semibold text-slate-900 underline">
          {t('register')}
        </Link>
      </p>
    </form>
  );
}
