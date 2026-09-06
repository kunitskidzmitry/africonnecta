import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import type { ProfileLanguage } from '@/lib/profile/schema';

/**
 * Один запрос к базе в составе сохранения профиля.
 *
 * Шаг `fields` несёт только published_at: остальные колонки собирает вызывающий код,
 * плану про них знать нечего — он отвечает исключительно за порядок.
 */
export type ProfileWriteStep =
  | { kind: 'fields'; publishedAt: string | null }
  | { kind: 'addExpertise'; expertiseIds: number[] }
  | { kind: 'addLanguages'; languages: ProfileLanguage[] }
  | { kind: 'removeExpertise'; expertiseIds: number[] }
  | { kind: 'removeLanguages'; languageIds: number[] }
  | { kind: 'publish'; publishedAt: string };

export type ProfileWriteState = {
  publishedAt: string | null;
  expertiseIds: number[];
  languageIds: number[];
};

export type ProfileWriteTarget = {
  published: boolean;
  expertiseIds: number[];
  languages: ProfileLanguage[];
};

/**
 * Порядок запросов, сохраняющих профиль.
 *
 * PostgREST не открывает транзакцию на несколько таблиц, поэтому сохранение — это
 * последовательность независимых запросов, и оборваться она может на любом из них.
 * Единственная защита от состояния «опубликован, но не находится поиском (§6.3)» —
 * порядок, и он вынесен сюда отдельной функцией именно поэтому: инвариант проверяется
 * тестом на всех префиксах плана (tests/profile-write-plan.test.ts), а не вычитывается
 * глазами из потока управления. Обоснование целиком — docs/decisions/0006.
 *
 * Правил всего два.
 *
 * Публикация снимается первым запросом и ставится последним. Пока связи в движении,
 * профиль либо черновик, либо опубликован с прежним полным набором.
 *
 * Внутри связей вставки идут перед удалениями. Обратный порядок опустошал бы набор
 * при полной замене (было «экономика», стало «агрономия»: удаление уже прошло, вставка
 * ещё нет), и опубликованный профиль оказывался бы без областей. При этом порядке
 * промежуточное состояние — объединение старого и нового, оно непусто по построению.
 */
export function planProfileWrite(
  current: ProfileWriteState,
  next: ProfileWriteTarget,
  now: string,
): ProfileWriteStep[] {
  const wasPublished = current.publishedAt !== null;
  const keepPublished = next.published && wasPublished;

  const currentExpertise = new Set(current.expertiseIds);
  const nextExpertise = new Set(next.expertiseIds);
  const currentLanguages = new Set(current.languageIds);
  const nextLanguages = new Set(next.languages.map((row) => row.languageId));

  // Разница, а не «удалить всё и вставить заново»: у expert_expertise есть колонки,
  // которых нет в форме (is_primary, years_experience). Перезапись стёрла бы их.
  const addExpertise = [...nextExpertise].filter((id) => !currentExpertise.has(id));
  const removeExpertise = [...currentExpertise].filter((id) => !nextExpertise.has(id));
  const removeLanguages = [...currentLanguages].filter((id) => !nextLanguages.has(id));

  const steps: ProfileWriteStep[] = [
    { kind: 'fields', publishedAt: keepPublished ? current.publishedAt : null },
  ];

  if (addExpertise.length > 0) {
    steps.push({ kind: 'addExpertise', expertiseIds: addExpertise });
  }

  // Все строки, а не только новые: у уже указанного языка мог измениться уровень.
  if (next.languages.length > 0) {
    steps.push({ kind: 'addLanguages', languages: next.languages });
  }

  if (removeExpertise.length > 0) {
    steps.push({ kind: 'removeExpertise', expertiseIds: removeExpertise });
  }

  if (removeLanguages.length > 0) {
    steps.push({ kind: 'removeLanguages', languageIds: removeLanguages });
  }

  if (next.published && !wasPublished) {
    steps.push({ kind: 'publish', publishedAt: now });
  }

  return steps;
}

/** Колонки experts, которые правит форма. published_at сюда не входит — им владеет план. */
export type ProfileColumns = Omit<
  Database['public']['Tables']['experts']['Update'],
  'id' | 'user_id' | 'published_at'
>;

/**
 * Один шаг плана — один запрос PostgREST. Возвращает текст ошибки или null.
 *
 * Живёт рядом с планом, а не внутри server action: тогда tests/integration/profile.test.ts
 * прогоняет настоящий план настоящими запросами к настоящей базе и проверяет инвариант
 * после каждого шага. Иначе проверялась бы копия порядка, а не сам порядок.
 */
export async function runProfileWriteStep(
  supabase: SupabaseClient<Database>,
  expertId: string,
  columns: ProfileColumns,
  step: ProfileWriteStep,
): Promise<string | null> {
  switch (step.kind) {
    case 'fields': {
      const { error } = await supabase
        .from('experts')
        .update({ ...columns, published_at: step.publishedAt })
        .eq('id', expertId);

      return error?.message ?? null;
    }

    case 'addExpertise': {
      const { error } = await supabase.from('expert_expertise').insert(
        step.expertiseIds.map((expertiseId) => ({
          expert_id: expertId,
          expertise_id: expertiseId,
        })),
      );

      return error?.message ?? null;
    }

    // upsert, а не insert: уровень владения у уже указанного языка мог измениться.
    case 'addLanguages': {
      const { error } = await supabase.from('expert_languages').upsert(
        step.languages.map((row) => ({
          expert_id: expertId,
          language_id: row.languageId,
          proficiency: row.proficiency,
        })),
        { onConflict: 'expert_id,language_id' },
      );

      return error?.message ?? null;
    }

    case 'removeExpertise': {
      const { error } = await supabase
        .from('expert_expertise')
        .delete()
        .eq('expert_id', expertId)
        .in('expertise_id', step.expertiseIds);

      return error?.message ?? null;
    }

    case 'removeLanguages': {
      const { error } = await supabase
        .from('expert_languages')
        .delete()
        .eq('expert_id', expertId)
        .in('language_id', step.languageIds);

      return error?.message ?? null;
    }

    case 'publish': {
      const { error } = await supabase
        .from('experts')
        .update({ published_at: step.publishedAt })
        .eq('id', expertId);

      return error?.message ?? null;
    }
  }
}
