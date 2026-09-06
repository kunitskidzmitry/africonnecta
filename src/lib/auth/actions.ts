'use server';

import type { AuthError } from '@supabase/supabase-js';
import type { ZodType } from 'zod';

import { redirect } from '@/i18n/navigation';
import { loginSchema, type LoginFormErrorKey } from '@/lib/auth/login-schema';
import type { LoginState } from '@/lib/auth/login-state';
import {
  expertRegistrationSchema,
  institutionRegistrationSchema,
  type RegistrationErrorKey,
} from '@/lib/auth/registration-schema';
import type { RegistrationState } from '@/lib/auth/registration-state';
import { homeFor, loadAppSession } from '@/lib/auth/session';
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

/**
 * Ошибка входа в ключ каталога переводов.
 *
 * По error.code, а не по тексту: message — английская строка GoTrue, она не является
 * контрактом и меняется между версиями. Коды перечислены в AuthError и стабильны.
 *
 * Неизвестный код становится 'unknown', а не 'invalidCredentials'. Сказать «неверный
 * пароль» человеку, у которого на самом деле лежит сеть или сломана конфигурация, —
 * значит отправить его менять правильный пароль.
 *
 * Перечисления пользователей это не создаёт: на несуществующий адрес и на неверный
 * пароль GoTrue отвечает одним и тем же invalid_credentials.
 */
const loginErrorByCode: Record<string, LoginFormErrorKey> = {
  invalid_credentials: 'invalidCredentials',
  validation_failed: 'invalidCredentials',
  email_not_confirmed: 'unconfirmed',
  user_banned: 'suspended',
  over_request_rate_limit: 'rateLimited',
};

function toLoginErrorKey(error: AuthError): LoginFormErrorKey {
  return (error.code && loginErrorByCode[error.code]) ?? 'unknown';
}

export async function signIn(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const locale = String(formData.get('locale') ?? 'en');
  const email = String(formData.get('email') ?? '');
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};

    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !(field in fieldErrors)) {
        fieldErrors[field] = issue.message;
      }
    }

    return { fieldErrors, formError: null, email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { fieldErrors: {}, formError: toLoginErrorKey(error), email: parsed.data.email };
  }

  // loadAppSession, а не getAppSession: пользователь уже в ответе входа, повторный
  // getUser() был бы лишним обращением к GoTrue, а мемоизация getAppSession внутри
  // запроса, который сам меняет сессию, зафиксировала бы неверное состояние.
  const session = data.user ? await loadAppSession(supabase, data.user) : null;

  // Сессия у GoTrue есть, а прав в приложении нет: заблокированный пользователь
  // не должен остаться внутри. Выходим и показываем отказ без подробностей.
  if (!session || session.status !== 'active') {
    await supabase.auth.signOut();
    return {
      fieldErrors: {},
      formError: session?.status === 'suspended' ? 'suspended' : 'invalidCredentials',
      email: parsed.data.email,
    };
  }

  redirect({ href: homeFor(session), locale });
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
