import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

import { describe, expect, it } from 'vitest';

import {
  expertRegistrationSchema,
  institutionRegistrationSchema,
  registrationErrorKeys,
} from '@/lib/auth/registration-schema';

const catalogue = JSON.parse(
  readFileSync(fileURLToPath(new URL('../messages/en.json', import.meta.url)), 'utf-8'),
) as { RegisterErrors: Record<string, string> };

const validExpert = {
  email: 'aline@example.test',
  password: 'correct horse battery',
  firstName: 'Aline',
  lastName: 'Uwase',
  phone: '+250 788 000 111',
  country: 'rw',
  currentInstitution: 'INES Ruhengeri',
  academicTitle: 'Senior Lecturer',
  highestDegree: 'PhD Physics',
  biography: 'Physicist working on renewable energy.',
};

const validInstitution = {
  email: 'contact@example.test',
  password: 'correct horse battery',
  organizationName: 'Kigali Institute',
  organizationType: 'research_institute',
  country: 'RW',
  website: 'https://ki.rw',
  contactPerson: 'Jean Baptiste',
  phone: '+250788222333',
};

describe('коды ошибок регистрации', () => {
  // Сообщения в схемах — это ключи каталога. Опечатка в ключе иначе доедет до продакшена
  // и покажет пользователю сырой идентификатор вместо текста.
  it.each(registrationErrorKeys)('ключ "%s" есть в каталоге переводов', (key) => {
    expect(catalogue.RegisterErrors[key]).toBeTruthy();
  });

  it('в каталоге нет ошибок уровня формы без применения', () => {
    for (const key of ['weakPassword', 'rateLimited', 'unknown']) {
      expect(catalogue.RegisterErrors[key]).toBeTruthy();
    }
  });
});

// Этот тест закрывает целый класс ошибок. Поля может не быть в запросе вовсе:
// невыбранный <select> браузер не отправляет, а подделанный запрос не отправит ничего.
// Zod в таком случае сообщает о неверном типе своим текстом, и пользователь видел бы
// «expected string, received undefined» вместо перевода.
describe.each([
  ['эксперта', expertRegistrationSchema],
  ['института', institutionRegistrationSchema],
])('пустой запрос на регистрацию %s', (_name, schema) => {
  it('даёт только известные ключи каталога, без сырых сообщений Zod', () => {
    const result = schema.safeParse({});

    expect(result.success).toBe(false);

    const messages = result.error?.issues.map((issue) => issue.message) ?? [];
    expect(messages.length).toBeGreaterThan(0);

    for (const message of messages) {
      expect(registrationErrorKeys).toContain(message);
    }
  });
});

describe('регистрация эксперта', () => {
  it('принимает полный корректный набор полей', () => {
    const result = expertRegistrationSchema.safeParse(validExpert);
    expect(result.success).toBe(true);
  });

  it('приводит код страны к верхнему регистру', () => {
    const result = expertRegistrationSchema.parse(validExpert);
    expect(result.country).toBe('RW');
  });

  it('обрезает пробелы по краям', () => {
    const result = expertRegistrationSchema.parse({ ...validExpert, firstName: '  Aline  ' });
    expect(result.firstName).toBe('Aline');
  });

  it('разрешает пустую биографию', () => {
    const result = expertRegistrationSchema.safeParse({ ...validExpert, biography: '' });
    expect(result.success).toBe(true);
  });

  // Короткий пароль — самая частая причина отказа, и он должен ловиться до похода в сеть.
  it('отклоняет пароль короче 12 символов', () => {
    const result = expertRegistrationSchema.safeParse({ ...validExpert, password: 'short1!' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('passwordTooShort');
  });

  it.each([
    ['email', 'not-an-email', 'emailInvalid'],
    ['phone', 'позвоните мне', 'phoneInvalid'],
    ['firstName', '   ', 'firstNameRequired'],
    ['currentInstitution', '', 'institutionRequired'],
    ['academicTitle', '', 'titleRequired'],
  ])('поле %s со значением "%s" даёт ошибку %s', (field, value, expected) => {
    const result = expertRegistrationSchema.safeParse({ ...validExpert, [field]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(expected);
  });
});

describe('регистрация института', () => {
  it('принимает полный корректный набор полей', () => {
    expect(institutionRegistrationSchema.safeParse(validInstitution).success).toBe(true);
  });

  it('разрешает отсутствие сайта', () => {
    expect(
      institutionRegistrationSchema.safeParse({ ...validInstitution, website: '' }).success,
    ).toBe(true);
  });

  it('отклоняет адрес сайта без схемы', () => {
    const result = institutionRegistrationSchema.safeParse({
      ...validInstitution,
      website: 'ki.rw',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('websiteInvalid');
  });

  it('отклоняет тип организации вне перечисления', () => {
    const result = institutionRegistrationSchema.safeParse({
      ...validInstitution,
      organizationType: 'startup',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('organizationTypeInvalid');
  });
});
