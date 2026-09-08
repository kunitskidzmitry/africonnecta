'use server';

import { refresh } from 'next/cache';

import { redirect } from '@/i18n/navigation';
import { getAppSession } from '@/lib/auth/session';
import { getMembershipInstitutionId } from '@/lib/opportunities/load';
import {
  parseCoverLetter,
  parseCreateOpportunityForm,
  parseInviteForm,
} from '@/lib/opportunities/schema';
import { createClient } from '@/lib/supabase/server';

export type OpportunityActionState = {
  fieldErrors: Record<string, string>;
  formError: string | null;
  ok: boolean;
};

const idle: OpportunityActionState = { fieldErrors: {}, formError: null, ok: false };

function fail(
  fieldErrors: Record<string, string> = {},
  formError: string | null = 'unknown',
): OpportunityActionState {
  return { fieldErrors, formError, ok: false };
}

export async function createOpportunity(
  _prev: OpportunityActionState,
  formData: FormData,
): Promise<OpportunityActionState> {
  const locale = String(formData.get('locale') ?? 'en');
  const session = await getAppSession();

  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }

  if (session.role !== 'institution_member' && session.role !== 'admin') {
    return fail({}, 'forbidden');
  }

  const institutionId = await getMembershipInstitutionId(session.userId);
  if (!institutionId) {
    return fail({}, 'forbidden');
  }

  const parsed = parseCreateOpportunityForm(formData);
  if (!parsed.success) {
    return fail(parsed.fieldErrors, null);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('opportunities')
    .insert({
      institution_id: institutionId,
      created_by: session.userId,
      title: parsed.data.title,
      description: parsed.data.description,
      type: parsed.data.type,
      mode: parsed.data.mode,
      location: parsed.data.location ?? null,
      duration: parsed.data.duration ?? null,
      status: parsed.data.publishNow ? 'published' : 'draft',
    })
    .select('id')
    .single();

  if (error || !data) {
    return fail({}, 'unknown');
  }

  redirect({ href: `/opportunities/${data.id}`, locale });
}

export async function publishOpportunity(formData: FormData): Promise<void> {
  const locale = String(formData.get('locale') ?? 'en');
  const id = String(formData.get('opportunityId') ?? '');
  const session = await getAppSession();

  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }

  const supabase = await createClient();
  await supabase.from('opportunities').update({ status: 'published' }).eq('id', id);

  refresh();
  redirect({ href: `/opportunities/${id}`, locale });
}

export async function closeOpportunity(formData: FormData): Promise<void> {
  const locale = String(formData.get('locale') ?? 'en');
  const id = String(formData.get('opportunityId') ?? '');
  const session = await getAppSession();

  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }

  const supabase = await createClient();
  await supabase.from('opportunities').update({ status: 'closed' }).eq('id', id);

  refresh();
  redirect({ href: `/opportunities/${id}`, locale });
}

export async function applyToOpportunity(
  _prev: OpportunityActionState,
  formData: FormData,
): Promise<OpportunityActionState> {
  const locale = String(formData.get('locale') ?? 'en');
  const opportunityId = String(formData.get('opportunityId') ?? '');
  const session = await getAppSession();

  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }

  if (!session.expertId) {
    return fail({}, 'forbidden');
  }

  const parsed = parseCoverLetter(formData);
  if (!parsed.success) {
    return fail(parsed.fieldErrors, null);
  }

  const supabase = await createClient();
  const { error } = await supabase.from('applications').insert({
    opportunity_id: opportunityId,
    expert_id: session.expertId,
    cover_letter: parsed.coverLetter,
  });

  if (error) {
    return fail({}, 'unknown');
  }

  refresh();
  return { ...idle, ok: true };
}

export async function decideApplication(formData: FormData): Promise<void> {
  const locale = String(formData.get('locale') ?? 'en');
  const applicationId = String(formData.get('applicationId') ?? '');
  const opportunityId = String(formData.get('opportunityId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const session = await getAppSession();

  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }

  if (decision !== 'accepted' && decision !== 'rejected' && decision !== 'shortlisted') {
    redirect({ href: `/opportunities/${opportunityId}`, locale });
  }

  const supabase = await createClient();
  await supabase.from('applications').update({ status: decision }).eq('id', applicationId);

  refresh();
  redirect({ href: `/opportunities/${opportunityId}`, locale });
}

export async function inviteExpert(
  _prev: OpportunityActionState,
  formData: FormData,
): Promise<OpportunityActionState> {
  const locale = String(formData.get('locale') ?? 'en');
  const opportunityId = String(formData.get('opportunityId') ?? '') || null;
  const session = await getAppSession();

  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }

  const institutionId = await getMembershipInstitutionId(session.userId);
  if (!institutionId) {
    return fail({}, 'forbidden');
  }

  const parsed = parseInviteForm(formData);
  if (!parsed.success) {
    return fail(parsed.fieldErrors, null);
  }

  const supabase = await createClient();
  const { error } = await supabase.from('invitations').insert({
    institution_id: institutionId,
    expert_id: parsed.expertId,
    opportunity_id: opportunityId,
    message: parsed.message,
  });

  if (error) {
    return fail({}, 'unknown');
  }

  refresh();
  return { ...idle, ok: true };
}

export async function respondToInvitation(formData: FormData): Promise<void> {
  const locale = String(formData.get('locale') ?? 'en');
  const invitationId = String(formData.get('invitationId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const session = await getAppSession();

  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }

  if (decision !== 'accepted' && decision !== 'declined') {
    redirect({ href: '/invitations', locale });
  }

  const supabase = await createClient();
  await supabase.from('invitations').update({ status: decision }).eq('id', invitationId);

  refresh();
  redirect({ href: '/invitations', locale });
}
