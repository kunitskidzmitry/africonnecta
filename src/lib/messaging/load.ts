import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type ConversationListItem = {
  id: string;
  institution_id: string;
  expert_id: string;
  last_message_at: string | null;
  reported_at: string | null;
  institution: { id: string; name: string } | null;
  expert: { id: string; first_name: string; last_name: string } | null;
};

export type MessageRow = {
  id: string;
  body: string;
  created_at: string;
  sender_user_id: string;
};

export type NotificationRow = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

function one<T>(value: T | T[] | null): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function listConversations(): Promise<ConversationListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('conversations')
    .select(
      'id, institution_id, expert_id, last_message_at, reported_at, institution:institutions!inner(id, name), expert:experts!inner(id, first_name, last_name)',
    )
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(50);

  if (error || !data) return [];

  return data.map((row) => ({
    ...row,
    institution: one(row.institution),
    expert: one(row.expert),
  }));
}

export async function getConversation(id: string): Promise<ConversationListItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('conversations')
    .select(
      'id, institution_id, expert_id, last_message_at, reported_at, institution:institutions!inner(id, name), expert:experts!inner(id, first_name, last_name)',
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    ...data,
    institution: one(data.institution),
    expert: one(data.expert),
  };
}

export async function listMessages(conversationId: string): Promise<MessageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('messages')
    .select('id, body, created_at, sender_user_id')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error || !data) return [];
  return data;
}

export async function listNotifications(): Promise<NotificationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, payload, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) return [];
  return data.map((row) => ({
    ...row,
    payload: (row.payload ?? {}) as Record<string, unknown>,
  }));
}

export async function countUnreadNotifications(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);

  if (error) return 0;
  return count ?? 0;
}

export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
}
