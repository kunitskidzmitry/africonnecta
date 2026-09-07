import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ProfileFileFields } from '@/components/profile/file-fields';
import { ExpertProfileForm } from '@/components/profile/expert-profile-form';
import { redirect } from '@/i18n/navigation';
import { getAppSession } from '@/lib/auth/session';
import { parseFileFailure, parseFileKind } from '@/lib/files/feedback';
import { loadOwnExpertProfile } from '@/lib/profile/load';
import { getCountries, getExpertiseOptions, getLanguages } from '@/lib/taxonomy';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
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
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 sm:gap-8 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('title')}</h1>
        <p className="text-slate-600">{t('subtitle')}</p>
      </div>

      {/* Файлы отдельной секцией и раньше формы: у них своя отправка и свой ответ
          (обработчик маршрута возвращает результат в адресе, см. api/files/upload). */}
      <ProfileFileFields
        locale={locale}
        photoFileId={profile.photoFileId}
        cvFileId={profile.cvFileId}
        saved={parseFileKind(query.file)}
        errorKey={parseFileFailure(query.fileError)}
        errorKind={parseFileKind(query.fileKind)}
      />

      <ExpertProfileForm
        profile={profile}
        countries={countries}
        languages={languages}
        expertise={expertise}
      />
    </main>
  );
}
