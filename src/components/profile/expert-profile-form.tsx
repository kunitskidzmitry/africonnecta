'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { LanguageFields } from '@/components/profile/language-fields';
import { Field } from '@/components/register/field';
import {
  FormError,
  SectionHeading,
  SubmitButton,
  type Country,
} from '@/components/register/form-parts';
import { updateOwnExpertProfile } from '@/lib/profile/actions';
import type { LoadedExpertProfile } from '@/lib/profile/load';
import { academicLevels, visibilities } from '@/lib/profile/schema';
import { emptyProfileState } from '@/lib/profile/state';
import type { ExpertiseOption, LanguageOption } from '@/lib/taxonomy-types';

export function ExpertProfileForm({
  profile,
  countries,
  languages,
  expertise,
}: {
  profile: LoadedExpertProfile;
  countries: Country[];
  languages: LanguageOption[];
  expertise: ExpertiseOption[];
}) {
  const t = useTranslations('Profile');
  const tRegister = useTranslations('Register');
  const locale = useLocale();
  const [state, formAction] = useActionState(updateOwnExpertProfile, emptyProfileState);
  const selected = new Set(profile.expertiseIds);
  const groups = groupExpertise(expertise);

  return (
    <form key={state.revision} action={formAction} className="flex flex-col gap-8" noValidate>
      <input type="hidden" name="locale" value={locale} />

      <FormError errorKey={state.formError} />

      {state.saved ? (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {t('saved')}
        </p>
      ) : null}

      <SectionHeading>{t('sectionAbout')}</SectionHeading>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          name="firstName"
          label={tRegister('fieldFirstName')}
          errorKey={state.fieldErrors.firstName}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              autoComplete="given-name"
              defaultValue={profile.firstName}
              required
            />
          )}
        </Field>

        <Field
          name="lastName"
          label={tRegister('fieldLastName')}
          errorKey={state.fieldErrors.lastName}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              autoComplete="family-name"
              defaultValue={profile.lastName}
              required
            />
          )}
        </Field>

        <Field name="phone" label={tRegister('fieldPhone')} errorKey={state.fieldErrors.phone}>
          {(props) => (
            <input {...props} type="tel" autoComplete="tel" defaultValue={profile.phone} required />
          )}
        </Field>

        <Field
          name="country"
          label={tRegister('fieldCountry')}
          errorKey={state.fieldErrors.country}
        >
          {(props) => (
            <select {...props} defaultValue={profile.countryIso2} required>
              <option value="" disabled>
                {tRegister('selectPlaceholder')}
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
        label={tRegister('fieldCurrentInstitution')}
        errorKey={state.fieldErrors.currentInstitution}
      >
        {(props) => (
          <input
            {...props}
            type="text"
            autoComplete="organization"
            defaultValue={profile.currentInstitution}
            required
          />
        )}
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          name="academicTitle"
          label={tRegister('fieldAcademicTitle')}
          errorKey={state.fieldErrors.academicTitle}
        >
          {(props) => (
            <input {...props} type="text" defaultValue={profile.academicTitle} required />
          )}
        </Field>

        <Field
          name="highestDegree"
          label={tRegister('fieldHighestDegree')}
          errorKey={state.fieldErrors.highestDegree}
        >
          {(props) => (
            <input {...props} type="text" defaultValue={profile.highestDegree} required />
          )}
        </Field>

        <Field
          name="academicLevel"
          label={t('fieldAcademicLevel')}
          errorKey={state.fieldErrors.academicLevel}
        >
          {(props) => (
            <select {...props} defaultValue={profile.academicLevel}>
              <option value="">{t('levelUnset')}</option>
              {academicLevels.map((level) => (
                <option key={level} value={level}>
                  {t(`level.${level}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <Field
        name="biography"
        label={tRegister('fieldBiography')}
        errorKey={state.fieldErrors.biography}
        optional
      >
        {(props) => <textarea {...props} rows={5} defaultValue={profile.biography} />}
      </Field>

      <SectionHeading>{t('sectionExpertise')}</SectionHeading>
      <p className="text-sm text-slate-600">{t('expertiseHint')}</p>
      <ExpertiseError errorKey={state.fieldErrors.expertiseId} />
      <div className="flex flex-col gap-6">
        {groups.map(({ parent, children }) => (
          <fieldset key={parent.id} className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-slate-800">{parent.label}</legend>
            {(children.length > 0 ? children : [parent]).map((item) => (
              <label key={item.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="expertiseId"
                  value={item.id}
                  defaultChecked={selected.has(item.id)}
                  className="rounded border-slate-300"
                />
                {item.label}
              </label>
            ))}
          </fieldset>
        ))}
      </div>

      <SectionHeading>{t('sectionLanguages')}</SectionHeading>
      <p className="text-sm text-slate-600">{t('languagesHint')}</p>
      <LanguageFields
        languages={languages}
        initial={profile.languages.map((row) => ({
          languageId: String(row.languageId),
          proficiency: row.proficiency,
        }))}
        errorKey={state.fieldErrors.languageId ?? state.fieldErrors.proficiency}
      />

      <SectionHeading>{t('sectionVisibility')}</SectionHeading>

      <Field name="visibility" label={t('fieldVisibility')} errorKey={state.fieldErrors.visibility}>
        {(props) => (
          <select {...props} defaultValue={profile.visibility}>
            {visibilities.map((value) => (
              <option key={value} value={value}>
                {t(`visibility.${value}`)}
              </option>
            ))}
          </select>
        )}
      </Field>

      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          name="published"
          value="on"
          defaultChecked={profile.published}
          className="mt-1 rounded border-slate-300"
        />
        <span>
          <span className="font-medium">{t('fieldPublished')}</span>
          <span className="mt-1 block text-xs text-slate-500">{t('publishedHint')}</span>
        </span>
      </label>

      <SubmitButton label={t('submit')} pendingLabel={t('submitting')} />
    </form>
  );
}

function ExpertiseError({ errorKey }: { errorKey?: string }) {
  const t = useTranslations('RegisterErrors');

  if (!errorKey) return null;

  return (
    <p role="alert" className="text-xs font-medium text-red-600">
      {t(errorKey)}
    </p>
  );
}

function groupExpertise(options: ExpertiseOption[]) {
  const parents = options.filter((item) => item.parentId === null);

  return parents.map((parent) => ({
    parent,
    children: options.filter((item) => item.parentId === parent.id),
  }));
}
