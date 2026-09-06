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
import { registerInstitution } from '@/lib/auth/actions';
import { emptyRegistrationState } from '@/lib/auth/registration-state';
import { institutionTypes } from '@/lib/auth/registration-schema';

/** Ключи каталога для значений перечисления institution_type. */
const typeLabelKeys = {
  university: 'typeUniversity',
  college: 'typeCollege',
  research_institute: 'typeResearchInstitute',
  government: 'typeGovernment',
  ngo: 'typeNgo',
  international_organization: 'typeInternationalOrganization',
  other: 'typeOther',
} as const;

/** Состав полей задан источником (Functional Spec §4, «Institution Registration Fields»). */
export function InstitutionForm({ countries }: { countries: Country[] }) {
  const t = useTranslations('Register');
  const locale = useLocale();
  const [state, formAction] = useActionState(registerInstitution, emptyRegistrationState);

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

      <SectionHeading>{t('sectionOrganisation')}</SectionHeading>

      <Field
        name="organizationName"
        label={t('fieldOrganizationName')}
        errorKey={state.fieldErrors.organizationName}
      >
        {(props) => <input {...props} type="text" autoComplete="organization" required />}
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          name="organizationType"
          label={t('fieldOrganizationType')}
          errorKey={state.fieldErrors.organizationType}
        >
          {(props) => (
            <select {...props} defaultValue="" required>
              <option value="" disabled>
                {t('selectPlaceholder')}
              </option>
              {institutionTypes.map((type) => (
                <option key={type} value={type}>
                  {t(typeLabelKeys[type])}
                </option>
              ))}
            </select>
          )}
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

      <Field name="website" label={t('fieldWebsite')} errorKey={state.fieldErrors.website} optional>
        {(props) => <input {...props} type="url" autoComplete="url" placeholder="https://" />}
      </Field>

      <SectionHeading>{t('sectionContact')}</SectionHeading>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          name="contactPerson"
          label={t('fieldContactPerson')}
          errorKey={state.fieldErrors.contactPerson}
        >
          {(props) => <input {...props} type="text" autoComplete="name" required />}
        </Field>

        <Field name="phone" label={t('fieldPhone')} errorKey={state.fieldErrors.phone}>
          {(props) => <input {...props} type="tel" autoComplete="tel" required />}
        </Field>
      </div>

      <SubmitButton />
    </form>
  );
}
