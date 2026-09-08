'use server';

import { refresh } from 'next/cache';

import { redirect } from '@/i18n/navigation';
import { getAppSession } from '@/lib/auth/session';
import {
  mapMessagingRpcError,
  parseMessageBody,
  parseReportForm,
  parseStartConversationForm,
} from '@/lib/messaging/schema';
import { createClient } from '@/lib/supabase/server';

export type MessagingActionState = {
  fieldErrors: Record<string, string>;
  formError: string | null;
  ok: boolean;
};

const idle: MessagingActionState = { fieldErrors: {}, formError: null, ok: false };

function fail(
  fieldErrors: Record<string, string> = {},
  formError: string | null = 'unknown',
): MessagingActionState {
  return { fieldErrors, formError, ok: false };
}

export async function startConversation(
  _prev: MessagingActionState,
  formData: FormData,
): Promise<MessagingActionState> {
  const locale = String(formData.get('locale') ?? 'en');
  const session = await getAppSession();

  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }

  const parsed = parseStartConversationForm(formData);
  if (!parsed.success) {
    return fail(parsed.fieldErrors, null);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('start_conversation', {
    target_expert_id: parsed.expertId,
    initial_body: parsed.body,
    related_opportunity_id: parsed.opportunityId ?? undefined,
  });

  if (error || !data) {
    return fail({}, mapMessagingRpcError(error?.code));
  }

  redirect({ href: `/messages/${data}`, locale });
}

export async function sendMessage(
  _prev: MessagingActionState,
  formData: FormData,
): Promise<MessagingActionState> {
  const locale = String(formData.get('locale') ?? 'en');
  const conversationId = String(formData.get('conversationId') ?? '');
  const session = await getAppSession();

  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }

  const parsed = parseMessageBody(formData);
  if (!parsed.success) {
    return fail(parsed.fieldErrors, null);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('send_message', {
    target_conversation_id: conversationId,
    message_body: parsed.body,
  });

  if (error) {
    return fail({}, mapMessagingRpcError(error.code));
  }

  refresh();
  return { ...idle, ok: true };
}

export async function reportConversation(
  _prev: MessagingActionState,
  formData: FormData,
): Promise<MessagingActionState> {
  const locale = String(formData.get('locale') ?? 'en');
  const conversationId = String(formData.get('conversationId') ?? '');
  const session = await getAppSession();

  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }

  const parsed = parseReportForm(formData);
  if (!parsed.success) {
    return fail(parsed.fieldErrors, null);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('report_conversation', {
    target_conversation_id: conversationId,
    reason: parsed.reason,
  });

  if (error) {
    return fail({}, mapMessagingRpcError(error.code));
  }

  refresh();
  return { ...idle, ok: true };
}

export async function markAllNotificationsRead(): Promise<void> {
  const session = await getAppSession();
  if (!session || session.status !== 'active') return;

  const supabase = await createClient();
  await supabase.rpc('mark_notifications_read');
  refresh();
}
