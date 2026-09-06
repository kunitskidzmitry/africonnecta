'use server';

import type { ZodType } from 'zod';

import { redirect } from '@/i18n/navigation';
import {
  expertRegistrationSchema,
  institutionRegistrationSchema,
  type RegistrationErrorKey,
} from '@/lib/auth/registration-schema';
import type { RegistrationState } from '@/lib/auth/registration-state';
import { createClient } from '@/lib/supabase/server';

// Тип и начальное состояние живут в registration-state.ts: модуль с 'use server'
// экспортирует только асинхронные функции, каждая из которых — точка входа с клиента.

/**
 * Разбирает ошибку Supabase в ключ каталога переводов.
 *
 * Заведомо НЕ различается случай «адрес уже зарегистрирован». Supabase при включённом
 * подтверждении почты отвечает на повторную регистрацию так же, как на новую, и это
 * правильно: иначе форма регистрации становится инструментом проверки, есть ли у платформы
 * такой пользователь. Владелец адреса вместо письма-подтверждения получит уведомление,
 * что на его почту пытались зарегистрироваться.
 */
function toFormErrorKey(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes('password')) return 'weakPassword';
  if (normalized.includes('rate limit') || normalized.includes('too many')) return 'rateLimited';

  return 'unknown';
}

type SignUpMetadata = Record<string, string>;

/** Обе формы обязаны нести учётные данные — это позволяет обойтись без приведения типов. */
type WithCredentials = { email: string; password: string };

async function register<T extends WithCredentials>(
  schema: ZodType<T>,
  formData: FormData,
  toMetadata: (value: T) => SignUpMetadata,
): Promise<RegistrationState> {
  const locale = String(formData.get('locale') ?? 'en');
  const raw = Object.fromEntries(formData);

  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Record<string, RegistrationErrorKey> = {};

    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      // Первая ошибка по полю важнее последующих: показывать пять сообщений
      // под одним полем бессмысленно.
      if (typeof field === 'string' && !(field in fieldErrors)) {
        fieldErrors[field] = issue.message as RegistrationErrorKey;
      }
    }

    return { fieldErrors, formError: null };
  }

  const value = parsed.data;
  const supabase = await createClient();

  // Профиль создаётся триггером в базе из этих метаданных, в одной транзакции
  // с учётной записью (см. миграцию 20260906160000_registration.sql).
  const { error } = await supabase.auth.signUp({
    email: value.email,
    password: value.password,
    options: {
      data: { ...toMetadata(value), locale },
      emailRedirectTo: buildConfirmUrl(locale),
    },
  });

  if (error) {
    return { fieldErrors: {}, formError: toFormErrorKey(error.message) };
  }

  // redirect() бросает исключение, поэтому вызывается вне try/catch и последним.
  redirect({ href: '/register/check-email', locale });
}

function buildConfirmUrl(locale: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const next = encodeURIComponent(`/${locale}/welcome`);

  return `${siteUrl}/api/auth/confirm?next=${next}`;
}

export async function signOut(formData: FormData): Promise<void> {
  const locale = String(formData.get('locale') ?? 'en');
  const supabase = await createClient();

  await supabase.auth.signOut();

  redirect({ href: '/', locale });
}

export async function registerExpert(
  _prevState: RegistrationState,
  formData: FormData,
): Promise<RegistrationState> {
  return register(expertRegistrationSchema, formData, (value) => ({
    role: 'expert',
    first_name: value.firstName,
    last_name: value.lastName,
    phone: value.phone,
    country: value.country,
    current_institution: value.currentInstitution,
    title: value.academicTitle,
    highest_degree: value.highestDegree,
    bio: value.biography ?? '',
  }));
}

export async function registerInstitution(
  _prevState: RegistrationState,
  formData: FormData,
): Promise<RegistrationState> {
  return register(institutionRegistrationSchema, formData, (value) => ({
    role: 'institution_member',
    organization_name: value.organizationName,
    institution_type: value.organizationType,
    country: value.country,
    website: value.website ?? '',
    contact_person: value.contactPerson,
    phone: value.phone,
  }));
}
