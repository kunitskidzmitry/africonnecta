import type { AcademicLevel } from '@/lib/profile/schema';

/**
 * Состояние поиска целиком лежит в URL.
 *
 * Это не стилистическое предпочтение, а следствие §3: страница обязана работать без
 * JavaScript. Значит, состояние переносит браузер — формой method="get" и обычными
 * ссылками, — а не клиентский код. Поэтому же здесь нет ни одного значения, которое
 * нельзя записать в строку запроса: нечего восстанавливать после перезагрузки, потому
 * что ничего и не терялось. Заодно выдача становится ссылкой, которой можно поделиться.
 *
 * В параметрах стоят устойчивые коды справочников (RW, fr, epidemiology), а не числовые
 * идентификаторы. Причина не в красоте ссылки, хотя «?area=epidemiology&country=RW»
 * читается и правится руками, а «?area=14&country=7» нет. Причина в том, что все три
 * справочника нумеруются identity-колонками, то есть номер зависит от порядка вставки
 * при засеве. Ссылка с номерами означала бы разное на разных стендах и разъезжалась бы
 * от любой правки seed.sql — а ссылкой на поиск делятся, в этом её смысл.
 */

export const SEARCH_PARAMS = {
  term: 'q',
  country: 'country',
  level: 'level',
  expertise: 'area',
  language: 'lang',
  cursorRank: 'ar',
  cursorPublishedAt: 'ap',
  cursorId: 'ai',
} as const;

export const PAGE_SIZE = 20;

/** Уровни из §4: значение вне списка приходит из подделанного URL, а не из формы. */
const ACADEMIC_LEVELS: readonly AcademicLevel[] = [
  'professor',
  'lecturer',
  'researcher',
  'phd_candidate',
];

export type SearchCursor = {
  rank: number;
  publishedAt: string;
  id: string;
};

/** Запрос как он записан в URL: коды справочников, а не идентификаторы. */
export type SearchQuery = {
  term: string;
  countryCodes: string[];
  levels: AcademicLevel[];
  expertiseSlugs: string[];
  languageCodes: string[];
  cursor: SearchCursor | null;
};

/** Тот же запрос после подстановки идентификаторов — в этом виде его понимает база. */
export type ResolvedQuery = {
  term: string;
  countryIds: number[];
  levels: AcademicLevel[];
  expertiseIds: number[];
  languageIds: number[];
  cursor: SearchCursor | null;
};

export type SearchTaxonomy = {
  countryIdByCode: Map<string, number>;
  languageIdByCode: Map<string, number>;
  expertiseIdBySlug: Map<string, number>;
  expertiseSlugById: Map<number, string>;
};

/** Значения одного параметра: браузер повторяет имя для каждой отмеченной галочки. */
function values(params: URLSearchParams, name: string): string[] {
  return [...new Set(params.getAll(name).filter((value) => value !== ''))];
}

function cursor(params: URLSearchParams): SearchCursor | null {
  const id = params.get(SEARCH_PARAMS.cursorId);
  const publishedAt = params.get(SEARCH_PARAMS.cursorPublishedAt);
  const rank = Number(params.get(SEARCH_PARAMS.cursorRank) ?? '0');

  // Курсор осмыслен только целиком: по двум третям keyset либо потеряет строки,
  // либо покажет их дважды. Неполный курсор — это первая страница.
  if (!id || !publishedAt || !Number.isFinite(rank)) return null;

  return { rank, publishedAt, id };
}

export function parseSearchQuery(params: URLSearchParams): SearchQuery {
  const levels = values(params, SEARCH_PARAMS.level).filter((value): value is AcademicLevel =>
    (ACADEMIC_LEVELS as readonly string[]).includes(value),
  );

  return {
    term: (params.get(SEARCH_PARAMS.term) ?? '').trim().slice(0, 200),
    countryCodes: values(params, SEARCH_PARAMS.country),
    levels,
    expertiseSlugs: values(params, SEARCH_PARAMS.expertise),
    languageCodes: values(params, SEARCH_PARAMS.language),
    cursor: cursor(params),
  };
}

/**
 * Коды в идентификаторы.
 *
 * Неизвестный код отбрасывается молча, и это осознанно. Строку запроса пользователь
 * не заполнял: в форме таких значений нет, они приходят из правленой руками ссылки
 * или из устаревшей закладки на удалённую область. Сообщение об ошибке предлагало бы
 * человеку починить то, чего он не ломал; правильный ответ — выдача без этого фильтра.
 */
export function resolveSearchQuery(query: SearchQuery, taxonomy: SearchTaxonomy): ResolvedQuery {
  const resolve = (codes: string[], index: Map<string, number>): number[] => [
    ...new Set(codes.map((code) => index.get(code)).filter((id): id is number => id !== undefined)),
  ];

  return {
    term: query.term,
    countryIds: resolve(query.countryCodes, taxonomy.countryIdByCode),
    levels: query.levels,
    expertiseIds: resolve(query.expertiseSlugs, taxonomy.expertiseIdBySlug),
    languageIds: resolve(query.languageCodes, taxonomy.languageIdByCode),
    cursor: query.cursor,
  };
}

/**
 * Обратная сборка: запрос в строку параметров.
 *
 * Курсор задаётся отдельным аргументом, а не берётся из query, потому что все ссылки
 * строятся от одного и того же запроса: «следующая страница» подставляет свой курсор,
 * а ссылка на расширенную выдачу — сбрасывает его в null. Курсор из старого запроса
 * в новой ссылке — это чужая страница чужой выдачи.
 */
export function buildSearchParams(
  query: SearchQuery,
  cursorOverride: SearchCursor | null = null,
): URLSearchParams {
  const params = new URLSearchParams();

  if (query.term) params.set(SEARCH_PARAMS.term, query.term);

  for (const code of query.countryCodes) params.append(SEARCH_PARAMS.country, code);
  for (const level of query.levels) params.append(SEARCH_PARAMS.level, level);
  for (const slug of query.expertiseSlugs) params.append(SEARCH_PARAMS.expertise, slug);
  for (const code of query.languageCodes) params.append(SEARCH_PARAMS.language, code);

  if (cursorOverride) {
    params.set(SEARCH_PARAMS.cursorRank, String(cursorOverride.rank));
    params.set(SEARCH_PARAMS.cursorPublishedAt, cursorOverride.publishedAt);
    params.set(SEARCH_PARAMS.cursorId, cursorOverride.id);
  }

  return params;
}

export function searchHref(query: SearchQuery, cursorOverride: SearchCursor | null = null): string {
  const params = buildSearchParams(query, cursorOverride).toString();

  return params ? `/search?${params}` : '/search';
}
