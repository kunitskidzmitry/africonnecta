import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link, redirect } from '@/i18n/navigation';
import { getAppSession } from '@/lib/auth/session';
import { respondToInvitation } from '@/lib/opportunities/actions';
import { listOwnInvitations } from '@/lib/opportunities/load';

export const dynamic = 'force-dynamic';

export default async function InvitationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, session] = await Promise.all([getTranslations('Opportunities'), getAppSession()]);

  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }

  if (!session.expertId) {
    redirect({ href: '/welcome', locale });
  }

  const invitations = await listOwnInvitations(session.expertId);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t('invitationsTitle')}</h1>
        <p className="text-slate-600">{t('invitationsSubtitle')}</p>
      </div>

      {invitations.length === 0 ? (
        <p className="text-slate-600">{t('invitationsEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {invitations.map((invitation) => (
            <li key={invitation.id} className="flex flex-col gap-3 border-b border-slate-200 pb-4">
              <div className="flex flex-col gap-1">
                <span className="font-medium">{invitation.institution?.name ?? '—'}</span>
                <span className="text-sm text-slate-500">
                  {t(`invitationStatuses.${invitation.status}`)}
                  {invitation.opportunity ? ` · ${invitation.opportunity.title}` : ''}
                </span>
              </div>
              {invitation.message ? (
                <p className="whitespace-pre-wrap text-sm text-slate-700">{invitation.message}</p>
              ) : null}
              {invitation.opportunity_id ? (
                <Link
                  href={`/opportunities/${invitation.opportunity_id}`}
                  className="text-sm underline"
                >
                  {t('viewOpportunity')}
                </Link>
              ) : null}
              {invitation.status === 'pending' ? (
                <div className="flex flex-wrap gap-2">
                  {(['accepted', 'declined'] as const).map((decision) => (
                    <form key={decision} action={respondToInvitation}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="invitationId" value={invitation.id} />
                      <input type="hidden" name="decision" value={decision} />
                      <button
                        type="submit"
                        className="inline-flex min-h-10 items-center rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:border-slate-900"
                      >
                        {t(`invitationDecisions.${decision}`)}
                      </button>
                    </form>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
