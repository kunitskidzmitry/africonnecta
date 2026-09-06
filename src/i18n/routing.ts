import { defineRouting } from 'next-intl/routing';

/**
 * Языки платформы.
 *
 * Q6 (§14.2 implementation-prompt): инфраструктура локализации закладывается сразу,
 * запуск — только на английском. Источник (§6 Functional Spec) перечисляет как языки
 * экспертов English, French, Kinyarwanda, Swahili, Portuguese, Arabic — но это фасет
 * поиска, а не языки интерфейса. Добавление локали интерфейса = запись здесь плюс
 * файл в `messages/`; тест `messages.test.ts` не даст забыть перевести ключи.
 */
export const routing = defineRouting({
  locales: ['en'],
  defaultLocale: 'en',
});

export type AppLocale = (typeof routing.locales)[number];
