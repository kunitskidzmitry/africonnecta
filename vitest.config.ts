import { fileURLToPath } from 'url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    // Интеграционные тесты требуют поднятого стека Supabase и вынесены в отдельный
    // запуск (npm run test:integration). Обычный `npm run test` обязан работать
    // без Docker и укладываться в секунды, иначе им перестают пользоваться.
    exclude: ['node_modules/**', 'tests/integration/**'],
  },
});
