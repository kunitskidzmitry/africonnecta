import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

/**
 * Используй эти обёртки вместо `next/link` и `next/navigation`:
 * они сами подставляют префикс локали в URL.
 */
export const {
  Link,
  redirect: intlRedirect,
  usePathname,
  useRouter,
  getPathname,
} = createNavigation(routing);

/**
 * Тот же redirect, но с честным типом `never`.
 *
 * Перенаправление в Next выполняется через исключение, поэтому код после вызова
 * недостижим. Обёртка next-intl этот тип теряет и возвращает void, из-за чего
 * TypeScript считает, что выполнение продолжится: в каждой ветке `if (!user) redirect(...)`
 * пришлось бы дописывать недостижимый return, а значение оставалось бы nullable.
 * Восстанавливаем тип один раз здесь.
 */
export const redirect: (...args: Parameters<typeof intlRedirect>) => never = (...args) => {
  intlRedirect(...args);

  // Недостижимо: intlRedirect всегда бросает исключение.
  throw new Error('redirect did not interrupt execution');
};
