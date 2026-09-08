import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { ComposeMessageForm } from '@/components/messaging/compose-message-form';
import { ReportConversationForm } from '@/components/messaging/report-conversation-form';
import { Link, redirect } from '@/i18n/navigation';
import { getAppSession } from '@/lib/auth/session';
import { getConversation, listMessages, markConversationRead } from '@/lib/messaging/load';

export const dynamic = 'force-dynamic';

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [t, session, conversation] = await Promise.all([
    getTranslations('Messaging'),
    getAppSession(),
    getConversation(id),
  ]);

  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }

  if (!conversation) {
    notFound();
  }

  const messages = await listMessages(id);
  await markConversationRead(id, session.userId);

  const peer =
    session.role === 'expert'
      ? (conversation.institution?.name ?? '—')
      : conversation.expert
        ? `${conversation.expert.first_name} ${conversation.expert.last_name}`
        : '—';

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-2">
        <Link href="/messages" className="text-sm text-slate-500 underline hover:text-slate-900">
          {t('backToInbox')}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{peer}</h1>
        {conversation.reported_at ? (
          <p className="text-sm text-amber-800">{t('reportedNotice')}</p>
        ) : null}
      </div>

      <ul className="flex flex-col gap-3">
        {messages.length === 0 ? (
          <li className="text-slate-600">{t('noMessagesYet')}</li>
        ) : (
          messages.map((message) => {
            const mine = message.sender_user_id === session.userId;
            return (
              <li
                key={message.id}
                className={`flex flex-col gap-1 rounded-md px-3 py-2 text-sm ${
                  mine
                    ? 'self-end bg-slate-900 text-white'
                    : 'self-start bg-slate-100 text-slate-900'
                } max-w-[85%]`}
              >
                <span className="whitespace-pre-wrap">{message.body}</span>
                <span className={`text-xs ${mine ? 'text-slate-300' : 'text-slate-500'}`}>
                  {new Date(message.created_at).toLocaleString(locale)}
                </span>
              </li>
            );
          })
        )}
      </ul>

      <ComposeMessageForm locale={locale} conversationId={id} />

      <section className="border-t border-slate-200 pt-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('reportTitle')}</h2>
        <ReportConversationForm locale={locale} conversationId={id} />
      </section>
    </main>
  );
}
