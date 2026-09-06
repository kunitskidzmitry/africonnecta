import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

import { describe, expect, it } from 'vitest';

import { loginErrorKeys, loginSchema } from '@/lib/auth/login-schema';

const catalogue = JSON.parse(
  readFileSync(fileURLToPath(new URL('../messages/en.json', import.meta.url)), 'utf-8'),
) as { RegisterErrors: Record<string, string> };

describe('коды ошибок входа', () => {
  it.each(loginErrorKeys)('ключ "%s" есть в каталоге переводов', (key) => {
    expect(catalogue.RegisterErrors[key]).toBeTruthy();
  });
});

describe('схема входа', () => {
  it('принимает короткий пароль: порог длины — правило регистрации, не входа', () => {
    const result = loginSchema.safeParse({
      email: 'expert@example.test',
      password: 'password123',
    });

    expect(result.success).toBe(true);
  });

  it('отклоняет пустой пароль', () => {
    const result = loginSchema.safeParse({ email: 'expert@example.test', password: '' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('passwordRequired');
  });

  it('отклоняет некорректный адрес', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'password123' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('emailInvalid');
  });
});
