'use server';

import { refresh } from 'next/cache';

import { getAppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

export type AdminActionState = {
  formError: string | null;
  ok: boolean;
};

const idle: AdminActionState = { formError: null, ok: false };

export async function setUserStatusAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const session = await getAppSession();
  if (!session || session.status !== 'active' || session.role !== 'admin') {
    return { formError: 'forbidden', ok: false };
  }

  const targetUserId = String(formData.get('userId') ?? '');
  const newStatus = String(formData.get('status') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();

  if (!targetUserId || (newStatus !== 'active' && newStatus !== 'suspended')) {
    return { formError: 'invalid', ok: false };
  }
  if (reason.length < 1) {
    return { formError: 'reasonRequired', ok: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_user_status', {
    target_user_id: targetUserId,
    new_status: newStatus,
    reason,
  });

  if (error) return { formError: 'unknown', ok: false };
  refresh();
  return { ...idle, ok: true };
}
