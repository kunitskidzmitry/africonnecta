import 'server-only';

import type { Country } from '@/components/register/form-parts';
import { createClient } from '@/lib/supabase/server';
import type { ExpertiseOption, LanguageOption } from '@/lib/taxonomy-types';

export type { ExpertiseOption, LanguageOption };

/**
 * Справочник стран для выпадающих списков.
 *
 * Читается публичным ключом: у countries есть политика чтения для всех (§4.3), потому что
 * список нужен и незарегистрированному посетителю на форме и в фасетах поиска.
 * Персональных данных в справочнике нет.
 */
export async function getCountries(): Promise<Country[]> {
  const supabase = await createClient();

  // id читается вместе с кодом: форма регистрации отправляет iso2, а выдача поиска
  // приходит с country_id — подписать страну в карточке больше нечем.
  const { data, error } = await supabase.from('countries').select('id, iso2, name').order('name');

  if (error) {
    throw new Error(`Не удалось загрузить справочник стран: ${error.message}`);
  }

  return data;
}

export async function getLanguages(): Promise<LanguageOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('languages')
    .select('id, iso639_1, name')
    .order('name');

  if (error) {
    throw new Error(`Не удалось загрузить справочник языков: ${error.message}`);
  }

  return data.map((row) => ({ id: row.id, code: row.iso639_1, name: row.name }));
}

export async function getExpertiseOptions(): Promise<ExpertiseOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('expertise')
    .select('id, slug, label, parent_id')
    .order('label');

  if (error) {
    throw new Error(`Не удалось загрузить области экспертизы: ${error.message}`);
  }

  return data.map((row) => ({
    id: row.id,
    slug: row.slug,
    label: row.label,
    parentId: row.parent_id,
  }));
}
