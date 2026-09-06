import 'server-only';

import { getAppSession } from '@/lib/auth/session';
import type { AcademicLevel, Proficiency, Visibility } from '@/lib/profile/schema';
import { createClient } from '@/lib/supabase/server';

export type LoadedLanguage = {
  languageId: number;
  proficiency: Proficiency;
};

export type LoadedExpertProfile = {
  expertId: string;
  firstName: string;
  lastName: string;
  phone: string;
  countryIso2: string;
  currentInstitution: string;
  academicTitle: string;
  highestDegree: string;
  academicLevel: AcademicLevel | '';
  biography: string;
  visibility: Visibility;
  published: boolean;
  photoFileId: string | null;
  cvFileId: string | null;
  expertiseIds: number[];
  languages: LoadedLanguage[];
};

/**
 * Собственный профиль для формы редактирования.
 *
 * Телефон не читается обычным select: колонка закрыта грантом (§8/§9).
 * Владелец забирает его через my_expert_profile — отдельную функцию ровно для
 * этого случая. reveal_expert_contacts здесь не нужна: она для третьих лиц
 * и пишет журнал.
 */
export async function loadOwnExpertProfile(): Promise<LoadedExpertProfile | null> {
  const session = await getAppSession();

  if (!session?.expertId || session.status !== 'active') return null;

  const supabase = await createClient();
  const { data: rows, error } = await supabase.rpc('my_expert_profile');

  if (error) {
    throw new Error(`Не удалось загрузить профиль: ${error.message}`);
  }

  const expert = rows[0];

  if (!expert) return null;

  const [{ data: expertiseRows }, { data: languageRows }, { data: country }] = await Promise.all([
    supabase.from('expert_expertise').select('expertise_id').eq('expert_id', expert.id),
    supabase.from('expert_languages').select('language_id, proficiency').eq('expert_id', expert.id),
    expert.country_id
      ? supabase.from('countries').select('iso2').eq('id', expert.country_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    expertId: expert.id,
    firstName: expert.first_name,
    lastName: expert.last_name,
    phone: expert.phone ?? '',
    countryIso2: country?.iso2 ?? '',
    currentInstitution: expert.current_institution_name ?? '',
    academicTitle: expert.title ?? '',
    highestDegree: expert.highest_degree ?? '',
    academicLevel: expert.academic_level ?? '',
    biography: expert.bio ?? '',
    visibility: expert.profile_visibility,
    published: expert.published_at !== null,
    // Оба идентификатора приходят из my_expert_profile: обычным select их не взять,
    // cv_file_id закрыт грантом наравне с телефоном (§8).
    photoFileId: expert.photo_file_id,
    cvFileId: expert.cv_file_id,
    expertiseIds: (expertiseRows ?? []).map((row) => row.expertise_id),
    languages: (languageRows ?? []).map((row) => ({
      languageId: row.language_id,
      proficiency: row.proficiency as Proficiency,
    })),
  };
}
