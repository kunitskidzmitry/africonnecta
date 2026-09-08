import { z } from 'zod';

export const opportunityTypes = [
  'lectureship',
  'supervision',
  'research',
  'mentorship',
  'consulting',
  'conference',
  'other',
] as const;

export const opportunityModes = ['online', 'hybrid', 'onsite'] as const;

export type OpportunityType = (typeof opportunityTypes)[number];
export type OpportunityMode = (typeof opportunityModes)[number];

export const opportunityErrorKeys = [
  'titleRequired',
  'descriptionRequired',
  'typeInvalid',
  'modeInvalid',
  'coverLetterTooLong',
  'messageTooLong',
  'expertRequired',
  'unknown',
] as const;

export type OpportunityErrorKey = (typeof opportunityErrorKeys)[number];

const title = z
  .string({ error: 'titleRequired' })
  .trim()
  .min(1, { error: 'titleRequired' })
  .max(200, { error: 'titleRequired' });

const description = z
  .string({ error: 'descriptionRequired' })
  .trim()
  .min(1, { error: 'descriptionRequired' })
  .max(10000, { error: 'descriptionRequired' });

export const createOpportunitySchema = z.object({
  title,
  description,
  type: z.enum(opportunityTypes, { error: 'typeInvalid' }),
  mode: z.enum(opportunityModes, { error: 'modeInvalid' }),
  location: z.string().trim().max(200).optional(),
  duration: z.string().trim().max(100).optional(),
  publishNow: z.boolean(),
});

export type CreateOpportunityFields = z.infer<typeof createOpportunitySchema>;

export function parseCreateOpportunityForm(
  formData: FormData,
):
  | { success: true; data: CreateOpportunityFields }
  | { success: false; fieldErrors: Record<string, OpportunityErrorKey> } {
  const parsed = createOpportunitySchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description'),
    type: formData.get('type'),
    mode: formData.get('mode'),
    location: String(formData.get('location') ?? '') || undefined,
    duration: String(formData.get('duration') ?? '') || undefined,
    publishNow: formData.get('publishNow') === 'on',
  });

  if (parsed.success) {
    return { success: true, data: parsed.data };
  }

  const fieldErrors: Record<string, OpportunityErrorKey> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !fieldErrors[key]) {
      fieldErrors[key] = issue.message as OpportunityErrorKey;
    }
  }
  return { success: false, fieldErrors };
}

export function parseCoverLetter(
  formData: FormData,
):
  | { success: true; coverLetter: string | null }
  | { success: false; fieldErrors: Record<string, OpportunityErrorKey> } {
  const raw = String(formData.get('coverLetter') ?? '').trim();
  if (raw.length > 5000) {
    return { success: false, fieldErrors: { coverLetter: 'coverLetterTooLong' } };
  }
  return { success: true, coverLetter: raw.length > 0 ? raw : null };
}

export function parseInviteForm(
  formData: FormData,
):
  | { success: true; expertId: string; message: string | null }
  | { success: false; fieldErrors: Record<string, OpportunityErrorKey> } {
  const expertId = String(formData.get('expertId') ?? '').trim();
  const messageRaw = String(formData.get('message') ?? '').trim();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(expertId)) {
    return { success: false, fieldErrors: { expertId: 'expertRequired' } };
  }
  if (messageRaw.length > 2000) {
    return { success: false, fieldErrors: { message: 'messageTooLong' } };
  }

  return {
    success: true,
    expertId,
    message: messageRaw.length > 0 ? messageRaw : null,
  };
}
