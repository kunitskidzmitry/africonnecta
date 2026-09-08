import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { ApplyForm } from '@/components/opportunities/apply-form';
import { InviteForm } from '@/components/opportunities/invite-form';
import { Link } from '@/i18n/navigation';
import { getAppSession } from '@/lib/auth/session';
import {
  closeOpportunity,
  decideApplication,
  publishOpportunity,
} from '@/lib/opportunities/actions';
import {
  getMembershipInstitutionId,
  getOpportunity,
  getOwnApplication,
  listApplicationsForOpportunity,
} from '@/lib/opportunities/load';

export const dynamic = 'force-dynamic';

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [t, session, opportunity] = await Promise.all([
    getTranslations('Opportunities'),
    getAppSession(),
    getOpportunity(id),
  ]);

  if (!opportunity) {
    notFound();
  }

  const institutionId =
    session?.status === 'active' ? await getMembershipInstitutionId(session.userId) : null;
  const isOwner = Boolean(institutionId && institutionId === opportunity.institution_id);
  const isExpert = Boolean(session?.expertId && session.status === 'active');

  const [applications, ownApplication] = await Promise.all([
    isOwner ? listApplicationsForOpportunity(id) : Promise.resolve([]),
    isExpert && session?.expertId ? getOwnApplication(id, session.expertId) : Promise.resolve(null),
  ]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-2">
        <Link
          href="/opportunities"
          className="text-sm text-slate-500 underline hover:text-slate-900"
        >
          {t('backToBoard')}
        </Link>
        <p className="text-sm text-slate-500">
          {opportunity.institution?.name ?? '—'} · {t(`types.${opportunity.type}`)} ·{' '}
          {t(`modes.${opportunity.mode}`)} · {t(`statuses.${opportunity.status}`)}
        </p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{opportunity.title}</h1>
        {opportunity.location ? <p className="text-slate-600">{opportunity.location}</p> : null}
      </div>

      <div className="whitespace-pre-wrap text-slate-800">{opportunity.description}</div>

      {opportunity.duration ? (
        <p className="text-sm text-slate-600">
          {t('fieldDuration')}: {opportunity.duration}
        </p>
      ) : null}

      {isOwner && opportunity.status === 'draft' ? (
        <form action={publishOpportunity}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="opportunityId" value={id} />
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            {t('publish')}
          </button>
        </form>
      ) : null}

      {isOwner && opportunity.status === 'published' ? (
        <form action={closeOpportunity}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="opportunityId" value={id} />
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-900 hover:border-slate-900"
          >
            {t('close')}
          </button>
        </form>
      ) : null}

      {isExpert && opportunity.status === 'published' ? (
        <section className="flex flex-col gap-3 border-t border-slate-200 pt-6">
          <h2 className="text-lg font-semibold">{t('applyTitle')}</h2>
          {ownApplication ? (
            <p className="text-sm text-slate-600">
              {t('alreadyApplied', { status: t(`applicationStatuses.${ownApplication.status}`) })}
            </p>
          ) : (
            <ApplyForm locale={locale} opportunityId={id} />
          )}
        </section>
      ) : null}

      {isOwner ? (
        <section className="flex flex-col gap-4 border-t border-slate-200 pt-6">
          <h2 className="text-lg font-semibold">{t('applicationsTitle')}</h2>
          {applications.length === 0 ? (
            <p className="text-slate-600">{t('applicationsEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {applications.map((application) => (
                <li
                  key={application.id}
                  className="flex flex-col gap-2 border-b border-slate-100 pb-4"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                    <span className="font-medium">
                      {application.expert
                        ? `${application.expert.first_name} ${application.expert.last_name}`
                        : application.expert_id}
                      {application.expert?.title ? ` · ${application.expert.title}` : ''}
                    </span>
                    <span className="text-sm text-slate-500">
                      {t(`applicationStatuses.${application.status}`)}
                    </span>
                  </div>
                  {application.cover_letter ? (
                    <p className="whitespace-pre-wrap text-sm text-slate-700">
                      {application.cover_letter}
                    </p>
                  ) : null}
                  {application.status === 'submitted' ||
                  application.status === 'under_review' ||
                  application.status === 'shortlisted' ? (
                    <div className="flex flex-wrap gap-2">
                      {(['shortlisted', 'accepted', 'rejected'] as const).map((decision) => (
                        <form key={decision} action={decideApplication}>
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="opportunityId" value={id} />
                          <input type="hidden" name="applicationId" value={application.id} />
                          <input type="hidden" name="decision" value={decision} />
                          <button
                            type="submit"
                            className="inline-flex min-h-10 items-center rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:border-slate-900"
                          >
                            {t(`decisions.${decision}`)}
                          </button>
                        </form>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-3 pt-2">
            <h3 className="font-semibold">{t('inviteTitle')}</h3>
            <InviteForm locale={locale} opportunityId={id} />
          </div>
        </section>
      ) : null}
    </main>
  );
}
