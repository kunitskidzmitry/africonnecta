import 'server-only';

import type { Database } from '@/lib/database.types';
import { PAGE_SIZE, type ResolvedQuery, type SearchCursor } from '@/lib/search/query';
import { createClient } from '@/lib/supabase/server';

export type SearchResultRow = {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  academicLevel: Database['public']['Enums']['academic_level'] | null;
  highestDegree: string;
  institution: string;
  countryId: number | null;
  bioExcerpt: string;
  photoFileId: string | null;
  expertiseIds: number[];
  languageIds: number[];
  rank: number;
  publishedAt: string;
};

/**
 * Каким запросом получена выдача.
 *
 * Пометка нужна интерфейсу по §10: «нет точных совпадений → показать ближайшие
 * по иерархии экспертизы с честной пометкой „расширенный поиск“». Пометка обязана
 * приезжать из того же места, где принято решение расширять, иначе она рано или поздно
 * начнёт врать: выдача расширенная, надпись прежняя.
 */
export type SearchMode = 'exact' | 'broadened' | 'similar';

export type SearchResult = {
  mode: SearchMode;
  rows: SearchResultRow[];
  /** Курсор следующей страницы, либо null — дальше ничего нет. */
  next: SearchCursor | null;
  /** Область, до которой расширили запрос. Пусто, если не расширяли. */
  broadenedTo: number[];
};

type Row = Database['public']['CompositeTypes']['expert_search_row'];

/**
 * Композитный тип в Postgres не несёт not null ни по одной колонке, поэтому
 * сгенерированные типы объявляют nullable всё подряд. Строки без id не бывает,
 * но проверить это может только код — вот он и проверяет, один раз здесь.
 */
function toRow(row: Row): SearchResultRow | null {
  if (!row.id || !row.first_name || !row.last_name || !row.published_at) return null;

  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    title: row.title ?? '',
    academicLevel: row.academic_level ?? null,
    highestDegree: row.highest_degree ?? '',
    institution: row.current_institution_name ?? '',
    countryId: row.country_id ?? null,
    bioExcerpt: row.bio_excerpt ?? '',
    photoFileId: row.photo_file_id ?? null,
    expertiseIds: row.expertise_ids ?? [],
    languageIds: row.language_ids ?? [],
    rank: row.rank ?? 0,
    publishedAt: row.published_at,
  };
}

function rows(data: Row[] | null): SearchResultRow[] {
  return (data ?? []).map(toRow).filter((row): row is SearchResultRow => row !== null);
}

/**
 * Курсор следующей страницы.
 *
 * Считается по последней строке страницы, и только если страница полна. Неполная
 * страница означает, что выдача закончилась: ссылка «дальше» на ней вела бы в пустоту.
 * Это не идеально — при выдаче ровно в 20 строк ссылка появится и приведёт к пустому
 * экрану, — но альтернатива (запрашивать 21 строку, чтобы узнать про существование
 * следующей) стоит лишнего чтения на каждый поиск ради одного пограничного случая.
 */
function nextCursor(page: SearchResultRow[]): SearchCursor | null {
  if (page.length < PAGE_SIZE) return null;

  const last = page.at(-1);

  if (!last) return null;

  return { rank: last.rank, publishedAt: last.publishedAt, id: last.id };
}

type Client = Awaited<ReturnType<typeof createClient>>;

async function exact(
  supabase: Client,
  query: ResolvedQuery,
  expertiseIds: number[],
): Promise<SearchResultRow[]> {
  const { data, error } = await supabase.rpc('search_experts', {
    q: query.term || undefined,
    filter_country_ids: query.countryIds.length > 0 ? query.countryIds : undefined,
    filter_levels: query.levels.length > 0 ? query.levels : undefined,
    filter_expertise_ids: expertiseIds.length > 0 ? expertiseIds : undefined,
    filter_language_ids: query.languageIds.length > 0 ? query.languageIds : undefined,
    after_rank: query.cursor?.rank,
    after_published_at: query.cursor?.publishedAt,
    after_id: query.cursor?.id,
    page_size: PAGE_SIZE,
  });

  if (error) throw new Error(`Поиск не выполнился: ${error.message}`);

  return rows(data);
}

/**
 * Поиск с запасными путями по §10.
 *
 * Порядок попыток — от точного ответа к приблизительному, и остановка на первом
 * непустом. Расширение и поиск по написанию не складываются: если человек ошибся
 * в названии института, расширять область экспертизы бессмысленно, и наоборот.
 *
 * На второй и следующих страницах запасные пути отключены. Курсор принадлежит той
 * выдаче, по которой его выдали, и подставлять его в расширенный запрос — значит
 * листать один список ключом от другого: страницы разъедутся, часть строк выпадет.
 * Пустая вторая страница — это конец выдачи, а не повод показать что-нибудь ещё.
 */
export async function runSearch(query: ResolvedQuery): Promise<SearchResult> {
  const supabase = await createClient();
  const found = await exact(supabase, query, query.expertiseIds);

  if (found.length > 0 || query.cursor) {
    return { mode: 'exact', rows: found, next: nextCursor(found), broadenedTo: [] };
  }

  if (query.expertiseIds.length > 0) {
    const { data: wider, error } = await supabase.rpc('expertise_broaden', {
      ids: query.expertiseIds,
    });

    if (error) throw new Error(`Не удалось расширить область: ${error.message}`);

    const broadened = wider ?? [];

    // Расширять нечего, когда в запросе уже было целое поддерево: тот же самый набор
    // даст тот же самый пустой ответ, а пометка «расширенный поиск» окажется ложью.
    if (broadened.length > query.expertiseIds.length) {
      const wideRows = await exact(supabase, query, broadened);

      if (wideRows.length > 0) {
        return {
          mode: 'broadened',
          rows: wideRows,
          next: nextCursor(wideRows),
          broadenedTo: broadened,
        };
      }
    }
  }

  if (query.term) {
    const { data, error } = await supabase.rpc('search_experts_similar', {
      q: query.term,
      page_size: PAGE_SIZE,
    });

    if (error) throw new Error(`Поиск по написанию не выполнился: ${error.message}`);

    const similar = rows(data);

    // Пагинации у подсказки нет: next остаётся null намеренно, см. миграцию
    // 20260906220000 — это подсказка на пустой экран, а не выдача.
    if (similar.length > 0) {
      return { mode: 'similar', rows: similar, next: null, broadenedTo: [] };
    }
  }

  return { mode: 'exact', rows: [], next: null, broadenedTo: [] };
}
