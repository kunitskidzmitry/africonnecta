import { z } from 'zod';

/**
 * Вход. Пароль здесь не режем и не требуем 12 символов: порог длины — правило
 * регистрации, а не входа. Иначе засеянные учётки с уже существующим паролем
 * не смогли бы открыть форму, которую мы как раз и проверяем.
 */
export const loginSchema = z.object({
  email: z
    .string({ error: 'emailInvalid' })
    .trim()
    .max(254)
    .pipe(z.email({ error: 'emailInvalid' })),
  password: z.string({ error: 'passwordRequired' }).min(1, { error: 'passwordRequired' }).max(128),
});

/** Ошибки полей: их выдаёт схема, ключ совпадает с именем поля формы. */
export const loginFieldErrorKeys = ['emailInvalid', 'passwordRequired'] as const;

/** Ошибки уровня формы: их выдаёт Supabase или проверка статуса после входа. */
export const loginFormErrorKeys = [
  'invalidCredentials',
  'unconfirmed',
  'suspended',
  'rateLimited',
  'unknown',
] as const;

/**
 * Один каталог на весь вход. tests/login-schema.test.ts проходит по нему целиком,
 * поэтому ключ, забытый в messages/<locale>.json, роняет сборку, а не превращается
 * в пустое место под полем.
 */
export const loginErrorKeys = [...loginFieldErrorKeys, ...loginFormErrorKeys] as const;

export type LoginFormErrorKey = (typeof loginFormErrorKeys)[number];

export type LoginInput = z.infer<typeof loginSchema>;
