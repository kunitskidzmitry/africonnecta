import { getTranslations, setRequestLocale } from 'next-intl/server';

import { StartConversationForm } from '@/components/messaging/start-conversation-form';
import { Link, redirect } from '@/i18n/navigation';
import { getAppSession } from '@/lib/auth/session';
import { listConversations } from '@/lib/messaging/load';

export const dynamic = 'force-dynamic';

export default async function MessagesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, session] = await Promise.all([getTranslations('Messaging'), getAppSession()]);

  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }

  const conversations = await listConversations();
  const canStart = session.role === 'institution_member' || session.role === 'expert';

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('title')}</h1>
        <p className="text-slate-600">{t('subtitle')}</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('inboxTitle')}</h2>
        {conversations.length === 0 ? (
          <p className="text-slate-600">{t('inboxEmpty')}</p>
        ) : (
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            {conversations.map((item) => {
              const title =
                session.role === 'expert'
                  ? (item.institution?.name ?? '—')
                  : item.expert
                    ? `${item.expert.first_name} ${item.expert.last_name}`
                    : '—';
              return (
                <li key={item.id}>
                  <Link
                    href={`/messages/${item.id}`}
                    className="flex flex-col gap-1 py-4 hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-900">{title}</span>
                    <span className="text-sm text-slate-500">
                      {item.last_message_at
                        ? new Date(item.last_message_at).toLocaleString(locale)
                        : t('noMessagesYet')}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {canStart ? (
        <section className="flex flex-col gap-3 border-t border-slate-200 pt-6">
          <h2 className="text-lg font-semibold">{t('startTitle')}</h2>
          <p className="text-sm text-slate-600">
            {session.role === 'expert' ? t('startHintExpert') : t('startHintInstitution')}
          </p>
          <StartConversationForm
            locale={locale}
            mode={session.role === 'expert' ? 'expert' : 'institution'}
            expertId={session.expertId ?? undefined}
          />
        </section>
      ) : null}
    </main>
  );
}
