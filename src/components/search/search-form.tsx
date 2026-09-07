import { getTranslations } from 'next-intl/server';

import type { Country } from '@/components/register/form-parts';
import { getPathname } from '@/i18n/navigation';
import type { AcademicLevel } from '@/lib/profile/schema';
import { SEARCH_PARAMS, type SearchQuery } from '@/lib/search/query';
import type { ExpertiseOption, LanguageOption } from '@/lib/taxonomy-types';

const LEVELS: readonly AcademicLevel[] = ['professor', 'lecturer', 'researcher', 'phd_candidate'];

type Props = {
  locale: string;
  query: SearchQuery;
  countries: Country[];
  languages: LanguageOption[];
  expertise: ExpertiseOption[];
};

function Checkbox({
  name,
  value,
  label,
  checked,
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={checked}
        className="size-4 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
      />
      {label}
    </label>
  );
}

/**
 * Форма поиска: обычная HTML-форма с method="get".
 *
 * Ни строчки клиентского кода — по §3 страница обязана работать без JavaScript, и здесь
 * это не компромисс: браузер сам собирает строку запроса из имён полей, сам ставит
 * значения обратно при возврате назад и сам умеет «открыть в новой вкладке». Состояние,
 * которое пришлось бы держать в React, — это ровно то состояние, которое и так есть в URL.
 *
 * Побочное следствие важнее удобства реализации: при отправке браузер заменяет строку
 * запроса целиком, то есть курсор постраничного обхода исчезает сам. Новый набор фильтров
 * с чужим курсором открывался бы с середины — и объяснять этот пропуск было бы нечем.
 */
export async function SearchForm({ locale, query, countries, languages, expertise }: Props) {
  const t = await getTranslations('Search');
  const tProfile = await getTranslations('Profile');

  const roots = expertise.filter((area) => area.parentId === null);
  const childrenOf = (rootId: number) => expertise.filter((area) => area.parentId === rootId);

  return (
    <form
      method="get"
      action={getPathname({ href: '/search', locale })}
      className="flex flex-col gap-5 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:p-5"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="q" className="text-sm font-medium text-slate-700">
          {t('fieldTerm')}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="q"
            name={SEARCH_PARAMS.term}
            type="search"
            defaultValue={query.term}
            placeholder={t('termPlaceholder')}
            className="w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 sm:py-2 sm:text-sm"
          />
          <button
            type="submit"
            className="w-full shrink-0 rounded-md bg-slate-900 px-4 py-3 text-base font-semibold text-white hover:bg-slate-700 sm:w-auto sm:py-2 sm:text-sm"
          >
            {t('submit')}
          </button>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="country" className="text-sm font-medium text-slate-700">
            {t('fieldCountry')}
          </label>
          <select
            id="country"
            name={SEARCH_PARAMS.country}
            defaultValue={query.countryCodes[0] ?? ''}
            className="w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 sm:py-2 sm:text-sm"
          >
            <option value="">{t('anyCountry')}</option>
            {countries.map((country) => (
              <option key={country.iso2} value={country.iso2}>
                {country.name}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-slate-700">{t('fieldLevel')}</legend>
          {LEVELS.map((level) => (
            <Checkbox
              key={level}
              name={SEARCH_PARAMS.level}
              value={level}
              label={tProfile(`level.${level}`)}
              checked={query.levels.includes(level)}
            />
          ))}
        </fieldset>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-slate-700">{t('fieldLanguage')}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {languages.map((language) => (
            <Checkbox
              key={language.code}
              name={SEARCH_PARAMS.language}
              value={language.code}
              label={language.name}
              checked={query.languageCodes.includes(language.code)}
            />
          ))}
        </div>
      </fieldset>

      {/*
        details/summary раскрывается без JavaScript — двадцать галочек не занимают экран,
        пока их не попросили. Открыт заранее, если фильтр уже выбран: иначе выбранное
        было бы спрятано от того, кто его выбрал.
      */}
      <details open={query.expertiseSlugs.length > 0} className="flex flex-col gap-2">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          {t('fieldExpertise')}
        </summary>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {roots.map((root) => (
            <fieldset key={root.id} className="flex flex-col gap-2">
              <legend className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                {root.label}
              </legend>
              <Checkbox
                name={SEARCH_PARAMS.expertise}
                value={root.slug}
                label={root.label}
                checked={query.expertiseSlugs.includes(root.slug)}
              />
              {childrenOf(root.id).map((child) => (
                <Checkbox
                  key={child.id}
                  name={SEARCH_PARAMS.expertise}
                  value={child.slug}
                  label={child.label}
                  checked={query.expertiseSlugs.includes(child.slug)}
                />
              ))}
            </fieldset>
          ))}
        </div>
      </details>
    </form>
  );
}
