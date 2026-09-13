'use server';

import { refresh } from 'next/cache';

import { redirect } from '@/i18n/navigation';
import { getAppSession } from '@/lib/auth/session';
import { getMembershipInstitutionId } from '@/lib/opportunities/load';
import { getLatestAcs, recomputeAndStoreAcs, runOpportunityMatch } from '@/lib/scoring/load';
import { createClient } from '@/lib/supabase/server';

export type ScoringActionState = {
  formError: string | null;
  ok: boolean;
};

const idle: ScoringActionState = { formError: null, ok: false };

export async function recomputeOwnAcs(
  _prev: ScoringActionState,
  formData: FormData,
): Promise<ScoringActionState> {
  const locale = String(formData.get('locale') ?? 'en');
  const session = await getAppSession();
  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }
  if (session.role !== 'expert' || !session.expertId) {
    return { formError: 'forbidden', ok: false };
  }

  try {
    await recomputeAndStoreAcs(session.expertId, session.userId);
    refresh();
    return { ...idle, ok: true };
  } catch {
    return { formError: 'unknown', ok: false };
  }
}

export async function disputeAcs(
  _prev: ScoringActionState,
  formData: FormData,
): Promise<ScoringActionState> {
  const locale = String(formData.get('locale') ?? 'en');
  const reason = String(formData.get('reason') ?? '').trim();
  const session = await getAppSession();
  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }
  if (session.role !== 'expert' || !session.expertId) {
    return { formError: 'forbidden', ok: false };
  }
  if (reason.length < 1) {
    return { formError: 'reasonRequired', ok: false };
  }

  const latest = await getLatestAcs(session.expertId);
  if (!latest) {
    return { formError: 'noScore', ok: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('acs_disputes').insert({
    expert_id: session.expertId,
    score_id: latest.id,
    reason: reason.slice(0, 2000),
    created_by: session.userId,
  });

  if (error) return { formError: 'unknown', ok: false };
  refresh();
  return { ...idle, ok: true };
}

export async function runMatchForOpportunity(
  _prev: ScoringActionState,
  formData: FormData,
): Promise<ScoringActionState> {
  const locale = String(formData.get('locale') ?? 'en');
  const opportunityId = String(formData.get('opportunityId') ?? '');
  const session = await getAppSession();
  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }

  const institutionId = await getMembershipInstitutionId(session.userId);
  if (!institutionId) {
    return { formError: 'forbidden', ok: false };
  }

  let runId: string;
  try {
    ({ runId } = await runOpportunityMatch({
      opportunityId,
      actorUserId: session.userId,
      institutionId,
    }));
  } catch {
    return { formError: 'unknown', ok: false };
  }

  // redirect() throws; must stay outside try/catch (same pattern as auth/actions).
  redirect({ href: `/opportunities/${opportunityId}/matches?run=${runId}`, locale });
}

export async function runMatchForOpportunityForm(formData: FormData): Promise<void> {
  await runMatchForOpportunity({ formError: null, ok: false }, formData);
}

export async function requestInstitutionVerificationAction(): Promise<ScoringActionState> {
  const session = await getAppSession();
  if (!session || session.status !== 'active' || session.role !== 'institution_member') {
    return { formError: 'forbidden', ok: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('request_institution_verification');
  if (error) return { formError: 'unknown', ok: false };
  refresh();
  return { ...idle, ok: true };
}

export async function decideVerificationAction(
  _prev: ScoringActionState,
  formData: FormData,
): Promise<ScoringActionState> {
  const session = await getAppSession();
  if (!session || session.status !== 'active' || session.role !== 'admin') {
    return { formError: 'forbidden', ok: false };
  }

  const requestId = String(formData.get('requestId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!requestId || (decision !== 'approve' && decision !== 'reject') || reason.length < 1) {
    return { formError: 'reasonRequired', ok: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('decide_verification_request', {
    request_id: requestId,
    approve: decision === 'approve',
    reason,
  });
  if (error) return { formError: 'unknown', ok: false };
  refresh();
  return { ...idle, ok: true };
}

export async function adminVerifyInstitutionAction(
  _prev: ScoringActionState,
  formData: FormData,
): Promise<ScoringActionState> {
  const session = await getAppSession();
  if (!session || session.status !== 'active' || session.role !== 'admin') {
    return { formError: 'forbidden', ok: false };
  }

  const institutionId = String(formData.get('institutionId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!institutionId || reason.length < 1) {
    return { formError: 'reasonRequired', ok: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_institution_verified', {
    target_institution_id: institutionId,
    approve: true,
    reason,
  });
  if (error) return { formError: 'unknown', ok: false };
  refresh();
  return { ...idle, ok: true };
}
