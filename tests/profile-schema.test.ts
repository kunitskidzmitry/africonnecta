import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

import { describe, expect, it } from 'vitest';

import { parseExpertProfileForm, profileErrorKeys } from '@/lib/profile/schema';

const catalogue = JSON.parse(
  readFileSync(fileURLToPath(new URL('../messages/en.json', import.meta.url)), 'utf-8'),
) as { RegisterErrors: Record<string, string> };

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      for (const item of value) data.append(key, item);
    } else {
      data.set(key, value);
    }
  }

  return data;
}

const valid = {
  firstName: 'Yves',
  lastName: 'Habimana',
  phone: '+250788123456',
  country: 'rw',
  currentInstitution: 'University of Rwanda',
  academicTitle: 'Lecturer in Economics',
  highestDegree: 'PhD Economics',
  academicLevel: 'lecturer',
  biography: 'Development policy.',
  visibility: 'public',
  published: 'on',
  expertiseId: ['1', '2'],
  languageId: ['1'],
  proficiency: ['c1'],
};

describe('коды ошибок профиля', () => {
  it.each(profileErrorKeys)('ключ "%s" есть в каталоге переводов', (key) => {
    expect(catalogue.RegisterErrors[key]).toBeTruthy();
  });
});

describe('разбор формы профиля', () => {
  it('принимает полный корректный набор и приводит страну к верхнему регистру', () => {
    const result = parseExpertProfileForm(form(valid));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.country).toBe('RW');
    expect(result.data.published).toBe(true);
    expect(result.data.expertiseIds).toEqual([1, 2]);
    expect(result.data.languages).toEqual([{ languageId: 1, proficiency: 'c1' }]);
  });

  it('разрешает черновик без экспертизы и языков', () => {
    const result = parseExpertProfileForm(
      form({
        ...valid,
        published: '',
        expertiseId: [],
        languageId: [''],
        proficiency: ['b2'],
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.published).toBe(false);
    expect(result.data.expertiseIds).toEqual([]);
    expect(result.data.languages).toEqual([]);
  });

  it('не публикует профиль без экспертизы', () => {
    const result = parseExpertProfileForm(
      form({ ...valid, expertiseId: [], languageId: ['1'], proficiency: ['c1'] }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors.expertiseId).toBe('expertiseRequired');
  });

  it('отклоняет повтор одного языка', () => {
    const result = parseExpertProfileForm(
      form({
        ...valid,
        languageId: ['1', '1'],
        proficiency: ['c1', 'b2'],
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors.languageId).toBe('languageDuplicate');
  });

  it('отклоняет пустое имя', () => {
    const result = parseExpertProfileForm(form({ ...valid, firstName: '   ' }));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors.firstName).toBe('firstNameRequired');
  });
});
