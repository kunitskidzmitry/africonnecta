'use server';

import { refresh } from 'next/cache';

import { redirect } from '@/i18n/navigation';
import { getAppSession } from '@/lib/auth/session';
import { parseExpertProfileForm } from '@/lib/profile/schema';
import type { ProfileState } from '@/lib/profile/state';
import {
  planProfileWrite,
  runProfileWriteStep,
  type ProfileColumns,
} from '@/lib/profile/write-plan';
import { createClient } from '@/lib/supabase/server';
import { getExpertiseOptions, getLanguages } from '@/lib/taxonomy';

/** Ошибка, после которой форма остаётся на месте с прежними значениями полей. */
function rejected(
  prevState: ProfileState,
  reason: { fieldErrors: Record<string, string> } | { formError: string },
): ProfileState {
  return {
    fieldErrors: 'fieldErrors' in reason ? reason.fieldErrors : {},
    formError: 'formError' in reason ? reason.formError : null,
    saved: false,
    // revision не меняется: форма не перемонтируется и не теряет то, что человек набрал.
    revision: prevState.revision,
  };
}

export async function updateOwnExpertProfile(
  prevState: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const locale = String(formData.get('locale') ?? 'en');
  const session = await getAppSession();

  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }

  if (!session.expertId) {
    redirect({ href: '/welcome', locale });
  }

  const parsed = parseExpertProfileForm(formData);

  if (!parsed.success) {
    return rejected(prevState, { fieldErrors: parsed.fieldErrors });
  }

  const supabase = await createClient();
  const [{ data: countries }, expertiseCatalog, languageCatalog, { data: mine, error: loadError }] =
    await Promise.all([
      supabase.from('countries').select('id').eq('iso2', parsed.data.country).maybeSingle(),
      getExpertiseOptions(),
      getLanguages(),
      supabase.rpc('my_expert_profile'),
    ]);

  const current = mine?.[0];

  if (loadError || !current) {
    return rejected(prevState, { formError: 'unknown' });
  }

  if (!countries) {
    return rejected(prevState, { fieldErrors: { country: 'countryRequired' } });
  }

  // Внешние ключи в базе отвергли бы чужой id и сами, но тогда пользователь увидел бы
  // «что-то пошло не так» вместо указания на конкретное поле. Оба запроса идут в том же
  // Promise.all выше, так что проверка ничего не стоит по времени.
  const allowedExpertise = new Set(expertiseCatalog.map((item) => item.id));
  const allowedLanguages = new Set(languageCatalog.map((item) => item.id));

  if (parsed.data.expertiseIds.some((id) => !allowedExpertise.has(id))) {
    return rejected(prevState, { fieldErrors: { expertiseId: 'expertiseInvalid' } });
  }

  if (parsed.data.languages.some((row) => !allowedLanguages.has(row.languageId))) {
    return rejected(prevState, { fieldErrors: { languageId: 'languageInvalid' } });
  }

  const expertId = current.id;

  // Название вписано руками — значит, ссылка на карточку института больше не про него.
  const sameInstitution =
    (current.current_institution_name ?? '') === parsed.data.currentInstitution;

  const columns: ProfileColumns = {
    first_name: parsed.data.firstName,
    last_name: parsed.data.lastName,
    phone: parsed.data.phone,
    country_id: countries.id,
    current_institution_name: parsed.data.currentInstitution,
    current_institution_id: sameInstitution ? current.current_institution_id : null,
    title: parsed.data.academicTitle,
    highest_degree: parsed.data.highestDegree,
    academic_level: parsed.data.academicLevel ? parsed.data.academicLevel : null,
    bio: parsed.data.biography ? parsed.data.biography : null,
    profile_visibility: parsed.data.visibility,
  };

  const [{ data: existingExpertise }, { data: existingLanguages }] = await Promise.all([
    supabase.from('expert_expertise').select('expertise_id').eq('expert_id', expertId),
    supabase.from('expert_languages').select('language_id').eq('expert_id', expertId),
  ]);

  const plan = planProfileWrite(
    {
      publishedAt: current.published_at,
      expertiseIds: (existingExpertise ?? []).map((row) => row.expertise_id),
      languageIds: (existingLanguages ?? []).map((row) => row.language_id),
    },
    parsed.data,
    new Date().toISOString(),
  );

  for (const step of plan) {
    const error = await runProfileWriteStep(supabase, expertId, columns, step);

    // Обрыв на середине плана — не порча данных, а откат к предыдущему целому
    // состоянию: об этом заботится порядок шагов в planProfileWrite.
    if (error) {
      return rejected(prevState, { formError: 'unknown' });
    }
  }

  // Без refresh() серверный компонент не перерисовался бы, и форма при перемонтировании
  // (key={revision}) вернула бы значения, загруженные до сохранения. То есть человек
  // увидел бы «Профиль сохранён» и рядом свой прежний текст.
  refresh();

  return { fieldErrors: {}, formError: null, saved: true, revision: prevState.revision + 1 };
}
