import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

import { routing } from './routing';

// ADR-0002: `requestLocale` помечен в next-intl как deprecated в пользу
// `next/root-params`. Типы root-params генерируются только после сборки, поэтому
// на M0 остаёмся на стабильном API. Миграция — отдельной задачей.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
