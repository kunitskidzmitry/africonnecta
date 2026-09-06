import { z } from 'zod';

export const academicLevels = ['professor', 'lecturer', 'researcher', 'phd_candidate'] as const;
export const visibilities = ['public', 'authenticated', 'hidden'] as const;
export const proficiencies = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'native'] as const;

export type AcademicLevel = (typeof academicLevels)[number];
export type Visibility = (typeof visibilities)[number];
export type Proficiency = (typeof proficiencies)[number];

export const profileErrorKeys = [
  'firstNameRequired',
  'lastNameRequired',
  'phoneInvalid',
  'countryRequired',
  'institutionRequired',
  'titleRequired',
  'degreeRequired',
  'bioTooLong',
  'academicLevelInvalid',
  'visibilityInvalid',
  'expertiseRequired',
  'expertiseInvalid',
  'languageRequired',
  'languageInvalid',
  'languageDuplicate',
] as const;

export type ProfileErrorKey = (typeof profileErrorKeys)[number];

const requiredText = (key: ProfileErrorKey, max: number) =>
  z.string({ error: key }).trim().min(1, { error: key }).max(max);

const phone = z
  .string({ error: 'phoneInvalid' })
  .trim()
  .regex(/^\+?[\d\s\-()]{7,20}$/, { error: 'phoneInvalid' });

const country = z
  .string({ error: 'countryRequired' })
  .trim()
  .length(2, { error: 'countryRequired' })
  .transform((value) => value.toUpperCase());

export const expertProfileSchema = z.object({
  firstName: requiredText('firstNameRequired', 100),
  lastName: requiredText('lastNameRequired', 100),
  phone,
  country,
  currentInstitution: requiredText('institutionRequired', 200),
  academicTitle: requiredText('titleRequired', 150),
  highestDegree: requiredText('degreeRequired', 150),
  academicLevel: z.enum(['', ...academicLevels], { error: 'academicLevelInvalid' }).optional(),
  biography: z.string().trim().max(2000, { error: 'bioTooLong' }).optional(),
  visibility: z.enum(visibilities, { error: 'visibilityInvalid' }),
});

export type ExpertProfileFields = z.infer<typeof expertProfileSchema>;

export type ProfileLanguage = {
  languageId: number;
  proficiency: Proficiency;
};

export type ParsedExpertProfile = ExpertProfileFields & {
  published: boolean;
  expertiseIds: number[];
  languages: ProfileLanguage[];
};

/** Пустая строка — это «не выбрано», а не ошибка: так выглядит placeholder в <select>. */
function toId(value: FormDataEntryValue | undefined): number | null | 'invalid' {
  const raw = typeof value === 'string' ? value.trim() : '';

  if (raw === '') return null;

  const id = Number(raw);

  return Number.isInteger(id) && id > 0 ? id : 'invalid';
}

/**
 * Связи профиля приезжают массивами (несколько чекбоксов, несколько строк языков).
 * Object.fromEntries их схлопнул бы в одно значение, поэтому разбираются отдельно.
 */
export function parseProfileRelations(formData: FormData): {
  expertiseIds: number[];
  languages: ProfileLanguage[];
  fieldErrors: Record<string, ProfileErrorKey>;
} {
  const fieldErrors: Record<string, ProfileErrorKey> = {};
  const expertise = new Set<number>();

  for (const value of formData.getAll('expertiseId')) {
    const id = toId(value);

    if (id === null) continue;
    if (id === 'invalid') {
      fieldErrors.expertiseId = 'expertiseInvalid';
      continue;
    }

    expertise.add(id);
  }

  // Язык и уровень приходят двумя параллельными списками: браузер сериализует поля
  // в порядке разметки, поэтому строка N — это languageId[N] вместе с proficiency[N].
  const languageIds = formData.getAll('languageId');
  const proficiencyValues = formData.getAll('proficiency');
  const languages: ProfileLanguage[] = [];
  const seen = new Set<number>();
  const rows = Math.max(languageIds.length, proficiencyValues.length);

  for (let index = 0; index < rows; index += 1) {
    const languageId = toId(languageIds[index]);

    if (languageId === null) continue;
    if (languageId === 'invalid') {
      fieldErrors.languageId = 'languageInvalid';
      continue;
    }

    const proficiencyEntry = proficiencyValues[index];
    const proficiency = typeof proficiencyEntry === 'string' ? proficiencyEntry.trim() : '';

    if (!isProficiency(proficiency)) {
      fieldErrors.proficiency = 'languageInvalid';
      continue;
    }

    if (seen.has(languageId)) {
      fieldErrors.languageId = 'languageDuplicate';
      continue;
    }

    seen.add(languageId);
    languages.push({ languageId, proficiency });
  }

  return { expertiseIds: [...expertise], languages, fieldErrors };
}

function isProficiency(value: string): value is Proficiency {
  return (proficiencies as readonly string[]).includes(value);
}

export function parseExpertProfileForm(
  formData: FormData,
):
  | { success: true; data: ParsedExpertProfile }
  | { success: false; fieldErrors: Record<string, string> } {
  const parsed = expertProfileSchema.safeParse(Object.fromEntries(formData));
  const relations = parseProfileRelations(formData);
  const fieldErrors: Record<string, string> = { ...relations.fieldErrors };

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      // Первая ошибка по полю важнее последующих, а ошибка связи важнее ошибки схемы:
      // «выберите язык из списка» полезнее, чем «поле заполнено неверно».
      if (typeof field === 'string' && !(field in fieldErrors)) {
        fieldErrors[field] = issue.message;
      }
    }
  }

  // Чекбокс приходит только когда отмечен; значение задано в разметке как "on".
  const published = formData.get('published') === 'on';

  // Опубликованный профиль без области и без языка не найдётся поиском (§6.3),
  // поэтому публикация — единственное, что делает эти связи обязательными.
  if (published && relations.expertiseIds.length === 0) {
    fieldErrors.expertiseId = 'expertiseRequired';
  }

  if (published && relations.languages.length === 0) {
    fieldErrors.languageId = 'languageRequired';
  }

  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors };
  }

  return {
    success: true,
    data: {
      ...parsed.data,
      published,
      expertiseIds: relations.expertiseIds,
      languages: relations.languages,
    },
  };
}
