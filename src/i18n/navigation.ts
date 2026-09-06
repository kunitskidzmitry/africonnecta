import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

/**
 * Используй эти обёртки вместо `next/link` и `next/navigation`:
 * они сами подставляют префикс локали в URL.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
