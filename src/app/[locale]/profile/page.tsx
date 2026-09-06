import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ExpertProfileForm } from '@/components/profile/expert-profile-form';
import { redirect } from '@/i18n/navigation';
import { getAppSession } from '@/lib/auth/session';
import { loadOwnExpertProfile } from '@/lib/profile/load';
import { getCountries, getExpertiseOptions, getLanguages } from '@/lib/taxonomy';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getAppSession();

  if (!session || session.status !== 'active') {
    redirect({ href: '/login', locale });
  }

  if (!session.expertId) {
    redirect({ href: '/welcome', locale });
  }

  const [t, profile, countries, languages, expertise] = await Promise.all([
    getTranslations('Profile'),
    loadOwnExpertProfile(),
    getCountries(),
    getLanguages(),
    getExpertiseOptions(),
  ]);

  if (!profile) {
    redirect({ href: '/welcome', locale });
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-slate-600">{t('subtitle')}</p>
      </div>

      <ExpertProfileForm
        profile={profile}
        countries={countries}
        languages={languages}
        expertise={expertise}
      />
    </main>
  );
}
