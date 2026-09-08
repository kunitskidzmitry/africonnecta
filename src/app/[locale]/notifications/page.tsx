import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link, redirect } from '@/i18n/navigation';
import { getAppSession } from '@/lib/auth/session';
import { markAllNotificationsRead } from '@/lib/messaging/actions';
import { listNotifications } from '@/lib/messaging/load';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, session] = await Promise.all([getTranslations('Messaging'), getAppSession()]);

  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }

  const notifications = await listNotifications();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{t('notificationsTitle')}</h1>
          <p className="text-slate-600">{t('notificationsSubtitle')}</p>
        </div>
        <form action={markAllNotificationsRead}>
          <button
            type="submit"
            className="inline-flex min-h-10 items-center rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:border-slate-900"
          >
            {t('markAllRead')}
          </button>
        </form>
      </div>

      {notifications.length === 0 ? (
        <p className="text-slate-600">{t('notificationsEmpty')}</p>
      ) : (
        <ul className="divide-y divide-slate-200 border-y border-slate-200">
          {notifications.map((item) => {
            const conversationId =
              typeof item.payload.conversation_id === 'string'
                ? item.payload.conversation_id
                : null;
            return (
              <li key={item.id} className="flex flex-col gap-1 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span
                    className={`font-medium ${item.read_at ? 'text-slate-600' : 'text-slate-900'}`}
                  >
                    {t(`notificationTypes.${item.type}`)}
                  </span>
                  <span className="text-xs text-slate-500">
                    {new Date(item.created_at).toLocaleString(locale)}
                  </span>
                </div>
                {conversationId ? (
                  <Link href={`/messages/${conversationId}`} className="text-sm underline">
                    {t('openConversation')}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
