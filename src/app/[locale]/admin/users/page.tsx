import { getTranslations, setRequestLocale } from 'next-intl/server';

import { UserStatusForm } from '@/components/admin/user-status-form';
import { Link } from '@/i18n/navigation';
import { loadAdminUsers } from '@/lib/admin/load';
import { requireAdmin } from '@/lib/admin/session';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireAdmin(locale);

  const [t, users] = await Promise.all([getTranslations('Admin'), loadAdminUsers()]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-sm text-slate-500 underline hover:text-slate-900">
          {t('backToAdmin')}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t('usersTitle')}</h1>
        <p className="text-slate-600">{t('usersSubtitle')}</p>
      </div>

      <ul className="flex flex-col gap-6">
        {users.map((user) => (
          <li key={user.id} className="flex flex-col gap-3 border-b border-slate-200 pb-6">
            <div className="flex flex-col gap-1">
              <p className="font-medium">{user.email}</p>
              <p className="text-sm text-slate-600">
                {user.role} · {user.status} · {new Date(user.created_at).toLocaleString(locale)}
              </p>
              <p className="font-mono text-xs text-slate-500">{user.id}</p>
            </div>
            {user.role !== 'admin' && user.id !== session.userId ? (
              <UserStatusForm userId={user.id} status={user.status} />
            ) : (
              <p className="text-sm text-slate-500">{t('usersProtected')}</p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
