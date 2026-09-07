import { getTranslations, setRequestLocale } from 'next-intl/server';

import { LoginForm } from '@/components/login/login-form';
import { redirect } from '@/i18n/navigation';
import { getAppSession, homeFor } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getAppSession();

  if (session?.status === 'active') {
    redirect({ href: homeFor(session), locale });
  }

  const t = await getTranslations('Login');

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10 sm:gap-8 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('title')}</h1>
        <p className="text-slate-600">{t('subtitle')}</p>
      </div>

      <LoginForm />
    </main>
  );
}
