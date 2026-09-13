import 'server-only';

import { redirect } from '@/i18n/navigation';
import { getAppSession, type AppSession } from '@/lib/auth/session';

export async function requireAdmin(locale: string): Promise<AppSession> {
  const session = await getAppSession();
  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }
  if (session.role !== 'admin') {
    redirect({ href: '/welcome', locale });
  }
  return session;
}
