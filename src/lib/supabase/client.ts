'use client';

import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@/lib/database.types';
import { env } from '@/lib/env';

/**
 * Клиент для браузера. Работает от публикуемого ключа, поэтому видит ровно то,
 * что разрешают политики RLS для роли текущего пользователя.
 */
export function createClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = env();

  return createBrowserClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
