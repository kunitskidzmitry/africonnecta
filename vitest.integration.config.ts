import { fileURLToPath } from 'url';

import { defineConfig } from 'vitest/config';

/**
 * Интеграционные тесты: работают против локального Supabase из `npm run db:start`.
 *
 * Отдельный конфиг, а не флаг: у этих тестов другие требования (Docker, живые контейнеры),
 * другое время выполнения и другой режим запуска — последовательный. Регистрация трогает
 * общие таблицы и почтовый ящик, параллельные файлы мешали бы друг другу.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
