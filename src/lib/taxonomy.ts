import 'server-only';

import type { Country } from '@/components/register/form-parts';
import { createClient } from '@/lib/supabase/server';

/**
 * Справочник стран для выпадающих списков.
 *
 * Читается публичным ключом: у countries есть политика чтения для всех (§4.3), потому что
 * список нужен и незарегистрированному посетителю на форме и в фасетах поиска.
 * Персональных данных в справочнике нет.
 */
export async function getCountries(): Promise<Country[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.from('countries').select('iso2, name').order('name');

  if (error) {
    throw new Error(`Не удалось загрузить справочник стран: ${error.message}`);
  }

  return data;
}
