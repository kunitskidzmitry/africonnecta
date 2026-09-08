import { z } from 'zod';

export const messagingErrorKeys = [
  'bodyRequired',
  'bodyTooLong',
  'expertRequired',
  'opportunityRequired',
  'reasonRequired',
  'forbidden',
  'unverified',
  'quotaInstitution',
  'quotaUser',
  'unknown',
] as const;

export type MessagingErrorKey = (typeof messagingErrorKeys)[number];

const bodySchema = z
  .string({ error: 'bodyRequired' })
  .trim()
  .min(1, { error: 'bodyRequired' })
  .max(5000, { error: 'bodyTooLong' });

export function parseMessageBody(
  formData: FormData,
):
  | { success: true; body: string }
  | { success: false; fieldErrors: Record<string, MessagingErrorKey> } {
  const parsed = bodySchema.safeParse(formData.get('body'));
  if (!parsed.success) {
    return { success: false, fieldErrors: { body: 'bodyRequired' } };
  }
  return { success: true, body: parsed.data };
}

export function parseStartConversationForm(formData: FormData):
  | {
      success: true;
      expertId: string;
      body: string;
      opportunityId: string | null;
    }
  | { success: false; fieldErrors: Record<string, MessagingErrorKey> } {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const expertId = String(formData.get('expertId') ?? '').trim();
  const opportunityRaw = String(formData.get('opportunityId') ?? '').trim();
  const bodyParsed = bodySchema.safeParse(formData.get('body'));

  const fieldErrors: Record<string, MessagingErrorKey> = {};

  if (!uuid.test(expertId)) {
    fieldErrors.expertId = 'expertRequired';
  }
  // Expert-initiated first contact requires a published opportunity (§9).
  // Empty is OK for institutions; invalid non-empty values are rejected.
  if (opportunityRaw && !uuid.test(opportunityRaw)) {
    fieldErrors.opportunityId = 'opportunityRequired';
  }
  if (!bodyParsed.success) {
    fieldErrors.body = 'bodyRequired';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors };
  }

  return {
    success: true,
    expertId,
    body: bodyParsed.data!,
    opportunityId: opportunityRaw && uuid.test(opportunityRaw) ? opportunityRaw : null,
  };
}

export function parseReportForm(
  formData: FormData,
):
  | { success: true; reason: string }
  | { success: false; fieldErrors: Record<string, MessagingErrorKey> } {
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 1) {
    return { success: false, fieldErrors: { reason: 'reasonRequired' } };
  }
  return { success: true, reason: reason.slice(0, 2000) };
}

export function mapMessagingRpcError(code: string | undefined): MessagingErrorKey {
  switch (code) {
    case 'AF002':
      return 'unverified';
    case 'AF003':
      return 'quotaInstitution';
    case 'AF004':
      return 'quotaUser';
    case '42501':
      return 'forbidden';
    default:
      return 'unknown';
  }
}
