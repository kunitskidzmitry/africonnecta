import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ExpertCard } from '@/components/search/expert-card';
import { SearchForm } from '@/components/search/search-form';
import { Link } from '@/i18n/navigation';
import {
  parseSearchQuery,
  resolveSearchQuery,
  searchHref,
  type SearchQuery,
  type SearchTaxonomy,
} from '@/lib/search/query';
import { runSearch } from '@/lib/search/run';
import { getCountries, getExpertiseOptions, getLanguages } from '@/lib/taxonomy';

/**
 * Выдача зависит от роли вызывающего: профили с видимостью 'authenticated' гость
 * не видит. Один и тот же URL при разных сессиях означает разные ответы, поэтому
 * страница собирается на запрос. Кешируемость публичного поиска остаётся открытым
 * вопросом (§3) — тем же, что описан в docs/decisions/0005.
 */
export const dynamic = 'force-dynamic';

/** Строка запроса в URLSearchParams: одно имя может повторяться, Next отдаёт массив. */
function toParams(input: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.append(key, value);
    }
  }

  return params;
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, rawParams] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const query = parseSearchQuery(toParams(rawParams));

  // Справочники нужны и для формы, и для подстановки идентификаторов, поэтому читаются
  // до поиска, а не вместе с ним. Три запроса к маленьким таблицам справочников против
  // одного лишнего круга — обмен, который стоит того: коды в URL этого требуют.
  const [t, countries, languages, expertise] = await Promise.all([
    getTranslations('Search'),
    getCountries(),
    getLanguages(),
    getExpertiseOptions(),
  ]);

  const countryNames = new Map(countries.map((country) => [country.id, country.name]));
  const languageNames = new Map(languages.map((language) => [language.id, language.name]));
  const expertiseLabels = new Map(expertise.map((area) => [area.id, area.label]));

  const taxonomy: SearchTaxonomy = {
    countryIdByCode: new Map(countries.map((country) => [country.iso2, country.id])),
    languageIdByCode: new Map(languages.map((language) => [language.code, language.id])),
    expertiseIdBySlug: new Map(expertise.map((area) => [area.slug, area.id])),
    expertiseSlugById: new Map(expertise.map((area) => [area.id, area.slug])),
  };

  const result = await runSearch(resolveSearchQuery(query, taxonomy));

  const broadenedSlugs = result.broadenedTo
    .map((id) => taxonomy.expertiseSlugById.get(id))
    .filter((slug): slug is string => slug !== undefined);

  /** Запрос, которым фактически получена выдача: ссылка «дальше» обязана вести в него. */
  const answered: SearchQuery =
    result.mode === 'broadened' ? { ...query, expertiseSlugs: broadenedSlugs } : query;

  /** Только то, что расширение добавило: перечислять обратно уже выбранное незачем. */
  const broadenedLabels = result.broadenedTo
    .filter((id) => {
      const slug = taxonomy.expertiseSlugById.get(id);

      return slug !== undefined && !query.expertiseSlugs.includes(slug);
    })
    .map((id) => expertiseLabels.get(id))
    .filter((label): label is string => label !== undefined);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-slate-600">{t('subtitle')}</p>
      </div>

      <SearchForm
        locale={locale}
        query={query}
        countries={countries}
        languages={languages}
        expertise={expertise}
      />

      {/*
        Пометка по §10. Она стоит над выдачей, а не под ней, и называет, что именно
        сделано: «нашли не то, что просили, вот что просили расширить». Спрятанная
        внизу или сформулированная общо, она превратилась бы в то самое молчаливое
        подсовывание чужого ответа, от которого §10 и предостерегает.
      */}
      {result.mode === 'broadened' ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('broadenedNotice')}
          {broadenedLabels.length > 0 ? ` ${t('broadenedTo')}: ${broadenedLabels.join(', ')}.` : ''}
        </p>
      ) : null}

      {result.mode === 'similar' ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('similarNotice', { term: query.term })}
        </p>
      ) : null}

      {result.rows.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-md bg-slate-100 px-4 py-5 text-sm text-slate-600">
          <p>{query.cursor ? t('emptyTail') : t('empty')}</p>
          {query.cursor ? (
            <Link href={searchHref(query)} className="font-semibold text-slate-900 underline">
              {t('backToFirstPage')}
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {result.rows.map((row) => (
            <ExpertCard
              key={row.id}
              row={row}
              countryNames={countryNames}
              expertiseLabels={expertiseLabels}
              languageNames={languageNames}
            />
          ))}
        </div>
      )}

      {result.next ? (
        <Link
          href={searchHref(answered, result.next)}
          rel="next"
          className="self-start rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
        >
          {t('nextPage')}
        </Link>
      ) : null}
    </main>
  );
}
