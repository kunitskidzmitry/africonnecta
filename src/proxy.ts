import createMiddleware from 'next-intl/middleware';

import { routing } from '@/i18n/routing';

// Next 16 переименовал соглашение `middleware.ts` -> `proxy.ts`.
// next-intl по-прежнему отдаёт обработчик через `next-intl/middleware`.
export default createMiddleware(routing);

export const config = {
  // Пропускаем API, статику и файлы с расширением.
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
