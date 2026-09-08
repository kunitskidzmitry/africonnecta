import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type OpportunityListItem = {
  id: string;
  title: string;
  type: string;
  mode: string;
  location: string | null;
  status: string;
  published_at: string | null;
  deadline: string | null;
  institution: { id: string; name: string } | null;
};

export type OpportunityDetail = OpportunityListItem & {
  description: string;
  duration: string | null;
  institution_id: string;
  created_by: string;
};

/** Опубликованные вакансии для доски. Контактов экспертов здесь нет и не будет (§7). */
export async function listPublishedOpportunities(): Promise<OpportunityListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('opportunities')
    .select(
      'id, title, type, mode, location, status, published_at, deadline, institution:institutions!inner(id, name)',
    )
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return data.map((row) => ({
    ...row,
    institution: Array.isArray(row.institution) ? (row.institution[0] ?? null) : row.institution,
  }));
}

export async function listInstitutionOpportunities(
  institutionId: string,
): Promise<OpportunityListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('opportunities')
    .select(
      'id, title, type, mode, location, status, published_at, deadline, institution:institutions!inner(id, name)',
    )
    .eq('institution_id', institutionId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return data.map((row) => ({
    ...row,
    institution: Array.isArray(row.institution) ? (row.institution[0] ?? null) : row.institution,
  }));
}

export async function getOpportunity(id: string): Promise<OpportunityDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('opportunities')
    .select(
      'id, title, description, type, mode, location, duration, status, published_at, deadline, institution_id, created_by, institution:institutions!inner(id, name)',
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    ...data,
    institution: Array.isArray(data.institution) ? (data.institution[0] ?? null) : data.institution,
  };
}

export type ApplicationRow = {
  id: string;
  status: string;
  cover_letter: string | null;
  created_at: string;
  expert_id: string;
  expert: {
    id: string;
    first_name: string;
    last_name: string;
    title: string | null;
  } | null;
};

/** Список заявок для институции. Контакты эксперта не выбираются (§7). */
export async function listApplicationsForOpportunity(
  opportunityId: string,
): Promise<ApplicationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('applications')
    .select(
      'id, status, cover_letter, created_at, expert_id, expert:experts!inner(id, first_name, last_name, title)',
    )
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => ({
    ...row,
    expert: Array.isArray(row.expert) ? (row.expert[0] ?? null) : row.expert,
  }));
}

export async function getOwnApplication(
  opportunityId: string,
  expertId: string,
): Promise<{ id: string; status: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('applications')
    .select('id, status')
    .eq('opportunity_id', opportunityId)
    .eq('expert_id', expertId)
    .maybeSingle();

  return data;
}

export type InvitationRow = {
  id: string;
  status: string;
  message: string | null;
  opportunity_id: string | null;
  institution: { id: string; name: string } | null;
  opportunity: { id: string; title: string } | null;
};

export async function listOwnInvitations(expertId: string): Promise<InvitationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('invitations')
    .select(
      'id, status, message, opportunity_id, institution:institutions!inner(id, name), opportunity:opportunities(id, title)',
    )
    .eq('expert_id', expertId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return data.map((row) => ({
    ...row,
    institution: Array.isArray(row.institution) ? (row.institution[0] ?? null) : row.institution,
    opportunity: Array.isArray(row.opportunity) ? (row.opportunity[0] ?? null) : row.opportunity,
  }));
}

export async function getMembershipInstitutionId(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('institution_members')
    .select('institution_id')
    .eq('user_id', userId)
    .maybeSingle();

  return data?.institution_id ?? null;
}
