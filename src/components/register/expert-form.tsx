'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { Field } from '@/components/register/field';
import {
  FormError,
  SectionHeading,
  SubmitButton,
  type Country,
} from '@/components/register/form-parts';
import { registerExpert } from '@/lib/auth/actions';
import { emptyRegistrationState } from '@/lib/auth/registration-state';

/**
 * Состав полей задан источником (Functional Spec §4, «Academic Registration Fields»).
 * Фотографии и CV здесь нет: загрузка файлов требует антивирусной проверки и разбора
 * сигнатуры содержимого (§9), это отдельный объём работ уже после входа в аккаунт.
 */
export function ExpertForm({ countries }: { countries: Country[] }) {
  const t = useTranslations('Register');
  const locale = useLocale();
  const [state, formAction] = useActionState(registerExpert, emptyRegistrationState);

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="locale" value={locale} />

      <FormError errorKey={state.formError} />

      <SectionHeading>{t('sectionAccount')}</SectionHeading>

      <Field name="email" label={t('fieldEmail')} errorKey={state.fieldErrors.email}>
        {(props) => <input {...props} type="email" autoComplete="email" required />}
      </Field>

      <Field
        name="password"
        label={t('fieldPassword')}
        errorKey={state.fieldErrors.password}
        hint={t('passwordHint')}
      >
        {(props) => <input {...props} type="password" autoComplete="new-password" required />}
      </Field>

      <SectionHeading>{t('sectionAbout')}</SectionHeading>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field name="firstName" label={t('fieldFirstName')} errorKey={state.fieldErrors.firstName}>
          {(props) => <input {...props} type="text" autoComplete="given-name" required />}
        </Field>

        <Field name="lastName" label={t('fieldLastName')} errorKey={state.fieldErrors.lastName}>
          {(props) => <input {...props} type="text" autoComplete="family-name" required />}
        </Field>

        <Field name="phone" label={t('fieldPhone')} errorKey={state.fieldErrors.phone}>
          {(props) => <input {...props} type="tel" autoComplete="tel" required />}
        </Field>

        <Field name="country" label={t('fieldCountry')} errorKey={state.fieldErrors.country}>
          {(props) => (
            <select {...props} defaultValue="" required>
              <option value="" disabled>
                {t('selectPlaceholder')}
              </option>
              {countries.map((country) => (
                <option key={country.iso2} value={country.iso2}>
                  {country.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <Field
        name="currentInstitution"
        label={t('fieldCurrentInstitution')}
        errorKey={state.fieldErrors.currentInstitution}
        hint={t('institutionHint')}
      >
        {(props) => <input {...props} type="text" autoComplete="organization" required />}
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          name="academicTitle"
          label={t('fieldAcademicTitle')}
          errorKey={state.fieldErrors.academicTitle}
        >
          {(props) => <input {...props} type="text" required />}
        </Field>

        <Field
          name="highestDegree"
          label={t('fieldHighestDegree')}
          errorKey={state.fieldErrors.highestDegree}
        >
          {(props) => <input {...props} type="text" required />}
        </Field>
      </div>

      <Field
        name="biography"
        label={t('fieldBiography')}
        errorKey={state.fieldErrors.biography}
        hint={t('biographyHint')}
        optional
      >
        {(props) => <textarea {...props} rows={4} />}
      </Field>

      <SubmitButton />
    </form>
  );
}
