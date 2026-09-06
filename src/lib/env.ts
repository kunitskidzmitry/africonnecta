import { z } from 'zod';

/**
 * Переменные окружения проверяются при первом обращении, а не при импорте модуля:
 * иначе сборка падала бы на машине без .env.local, хотя для `next build` эти значения
 * не нужны.
 *
 * Обращение к process.env записано буквально и не может стать динамическим: Next
 * подставляет значения NEXT_PUBLIC_* в клиентский бандл текстовой заменой по точному
 * совпадению `process.env.ИМЯ`. Любой доступ через переменную вернёт undefined в браузере.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url(),
});

let cached: z.infer<typeof schema> | null = null;

export function env(): z.infer<typeof schema> {
  if (cached) return cached;

  const parsed = schema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });

  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Некорректные переменные окружения: ${missing}. См. .env.example`);
  }

  cached = parsed.data;
  return cached;
}
