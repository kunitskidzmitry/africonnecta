'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

import { sendMessage, type MessagingActionState } from '@/lib/messaging/actions';

const initial: MessagingActionState = { fieldErrors: {}, formError: null, ok: false };

export function ComposeMessageForm({
  locale,
  conversationId,
}: {
  locale: string;
  conversationId: string;
}) {
  const t = useTranslations('Messaging');
  const te = useTranslations('MessagingErrors');
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(sendMessage, initial);

  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    router.refresh();
  }, [state.ok, router]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="conversationId" value={conversationId} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="sr-only">{t('fieldBody')}</span>
        <textarea
          name="body"
          required
          rows={3}
          maxLength={5000}
          placeholder={t('composePlaceholder')}
          className="rounded-md border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 sm:text-sm"
        />
        {state.fieldErrors.body ? (
          <span className="text-sm text-red-700">{te(state.fieldErrors.body)}</span>
        ) : null}
      </label>

      {state.formError ? <p className="text-sm text-red-700">{te(state.formError)}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60 sm:w-auto"
      >
        {pending ? t('sending') : t('sendSubmit')}
      </button>
    </form>
  );
}
