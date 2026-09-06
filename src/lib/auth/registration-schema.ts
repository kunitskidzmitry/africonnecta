import { z } from 'zod';

/**
 * Схемы регистрации. Состав полей задан источником: Functional Spec §4,
 * «Academic Registration Fields» и «Institution Registration Fields».
 *
 * Сообщения об ошибках — это ключи каталога переводов (messages/*.json, раздел
 * RegisterErrors), а не готовый текст. Иначе английские строки расползлись бы по коду
 * в обход next-intl, и добавление второго языка пришлось бы делать поиском по исходникам.
 * Тест tests/registration-schema.test.ts проверяет, что каждый использованный здесь ключ
 * существует в каталоге.
 *
 * Отступления от источника, сознательные:
 *   * Profile Photo и CV Upload не входят в регистрацию. Загрузка файлов требует
 *     presigned-выгрузки, проверки сигнатуры содержимого и антивируса (§9) — это
 *     отдельный объём работ. Оба поля заполняются в профиле после входа.
 *   * Biography необязательна. Источник перечисляет её среди полей регистрации, но
 *     обязательное сочинение текста на форме регистрации бьёт по конверсии, а на
 *     двустороннем маркетплейсе с холодным стартом (§10) наполнение стороны экспертов —
 *     главный риск. Поле остаётся на форме и заполняется по желанию.
 */

/** Единственный источник правды по кодам ошибок: и для схем, и для теста каталога. */
export const registrationErrorKeys = [
  'emailInvalid',
  'passwordTooShort',
  'firstNameRequired',
  'lastNameRequired',
  'phoneInvalid',
  'countryRequired',
  'institutionRequired',
  'titleRequired',
  'degreeRequired',
  'organizationRequired',
  'organizationTypeInvalid',
  'contactPersonRequired',
  'websiteInvalid',
  'bioTooLong',
] as const;

/**
 * Обязательное текстовое поле.
 *
 * Ключ ошибки задаётся в конструкторе z.string, а не только в .min(). Разница видна
 * в одном практическом случае: если поля в запросе нет вовсе, Zod сообщает о неверном
 * типе (undefined вместо строки), и без ключа в конструкторе пользователь увидел бы
 * английское техническое сообщение вместо перевода. Поля в запросе может не быть
 * не только у злоумышленника: <select> с невыбранным значением браузер не отправляет.
 */
const requiredText = (key: RegistrationErrorKey, max: number) =>
  z.string({ error: key }).trim().min(1, { error: key }).max(max);

const email = z
  .string({ error: 'emailInvalid' })
  .trim()
  .max(254)
  .pipe(z.email({ error: 'emailInvalid' }));

// Длина вместо требований к составу символов: сложные правила («цифра, спецсимвол»)
// вынуждают людей изобретать Password1! и снижают реальную стойкость. Так же считает
// NIST SP 800-63B. Порог продублирован в supabase/config.toml — Supabase проверяет
// пароль на своей стороне, и разойтись эти значения не должны.
//
// Пробелы по краям НЕ срезаются, в отличие от остальных полей: пароль обязан совпасть
// байт в байт при следующем входе, а форма входа о таком правиле знать не будет.
const password = z
  .string({ error: 'passwordTooShort' })
  .min(12, { error: 'passwordTooShort' })
  .max(128);

// Форматы телефонов в Африке и диаспоре разнородны, строгий разбор здесь дал бы
// ложные отказы. Проверяется только правдоподобие; нормализация — при верификации.
const phone = z
  .string({ error: 'phoneInvalid' })
  .trim()
  .regex(/^\+?[\d\s\-()]{7,20}$/, { error: 'phoneInvalid' });

// Код ISO 3166-1 alpha-2. Существование страны проверяет база по справочнику (§4.3).
const country = z
  .string({ error: 'countryRequired' })
  .trim()
  .length(2, { error: 'countryRequired' })
  .transform((value) => value.toUpperCase());

export const institutionTypes = [
  'university',
  'college',
  'research_institute',
  'government',
  'ngo',
  'international_organization',
  'other',
] as const;

export const expertRegistrationSchema = z.object({
  email,
  password,
  firstName: requiredText('firstNameRequired', 100),
  lastName: requiredText('lastNameRequired', 100),
  phone,
  country,
  currentInstitution: requiredText('institutionRequired', 200),
  academicTitle: requiredText('titleRequired', 150),
  highestDegree: requiredText('degreeRequired', 150),
  biography: z.string().trim().max(2000, { error: 'bioTooLong' }).optional(),
});

export const institutionRegistrationSchema = z.object({
  email,
  password,
  organizationName: requiredText('organizationRequired', 200),
  organizationType: z.enum(institutionTypes, { error: 'organizationTypeInvalid' }),
  country,
  // Сайт есть не у каждой организации, поэтому пустая строка допустима наравне
  // с отсутствием поля.
  website: z.union([z.url({ error: 'websiteInvalid' }).max(500), z.literal('')]).optional(),
  contactPerson: requiredText('contactPersonRequired', 150),
  phone,
});

export type ExpertRegistration = z.infer<typeof expertRegistrationSchema>;
export type InstitutionRegistration = z.infer<typeof institutionRegistrationSchema>;
export type RegistrationErrorKey = (typeof registrationErrorKeys)[number];
