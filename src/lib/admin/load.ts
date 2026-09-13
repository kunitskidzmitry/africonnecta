import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type EmptySearchRates = {
  windowDays: number;
  totalSearches: number;
  exactEmptyCount: number;
  finalEmptyCount: number;
  exactEmptyRate: number | null;
  finalEmptyRate: number | null;
};

export type AdminUserRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
};

export type ReportedConversation = {
  id: string;
  reported_at: string;
  report_reason: string | null;
  reported_by: string | null;
};

export async function loadEmptySearchRates(windowDays = 30): Promise<EmptySearchRates> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_search_empty_rates', {
    p_window_days: windowDays,
  });

  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  return {
    windowDays: Number(row?.window_days ?? windowDays),
    totalSearches: Number(row?.total_searches ?? 0),
    exactEmptyCount: Number(row?.exact_empty_count ?? 0),
    finalEmptyCount: Number(row?.final_empty_count ?? 0),
    exactEmptyRate: row?.exact_empty_rate == null ? null : Number(row.exact_empty_rate),
    finalEmptyRate: row?.final_empty_rate == null ? null : Number(row.final_empty_rate),
  };
}

export async function loadAdminUsers(limit = 40): Promise<AdminUserRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, role, status, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const ids = (data ?? []).map((row) => row.id);
  if (ids.length === 0) return [];

  // Email lives in auth.users; admin SELECT on public.users has no email column.
  // Use auth admin via service role is forbidden on client path — join through RPC?
  // For Phase 1: show id + role + status; email fetched from a security definer helper.
  const { data: emails, error: emailError } = await supabase.rpc('admin_list_user_emails', {
    target_ids: ids,
  });
  if (emailError) throw new Error(emailError.message);

  const emailById = new Map<string, string>();
  for (const row of emails ?? []) {
    emailById.set(row.id, row.email);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    email: emailById.get(row.id) ?? row.id,
    role: row.role,
    status: row.status,
    created_at: row.created_at,
  }));
}

export async function loadReportedConversations(limit = 40): Promise<ReportedConversation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('conversations')
    .select('id, reported_at, report_reason, reported_by')
    .not('reported_at', 'is', null)
    .order('reported_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    reported_at: row.reported_at!,
    report_reason: row.report_reason,
    reported_by: row.reported_by,
  }));
}
