import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

/**
 * Выбор роли перед регистрацией.
 *
 * Отдельный экран, а не переключатель внутри одной формы: наборы полей у эксперта
 * и института пересекаются лишь частично (§4 источника), а выбор роли определяет
 * всё дальнейшее поведение аккаунта и потому должен быть осознанным.
 */
export default async function RegisterChoicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Register');

  const options = [
    {
      href: '/register/expert',
      title: t('expertCardTitle'),
      body: t('expertCardBody'),
      cta: t('expertCardCta'),
    },
    {
      href: '/register/institution',
      title: t('institutionCardTitle'),
      body: t('institutionCardBody'),
      cta: t('institutionCardCta'),
    },
  ] as const;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t('chooseTitle')}</h1>
        <p className="text-slate-600">{t('chooseSubtitle')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {options.map((option) => (
          <Link
            key={option.href}
            href={option.href}
            className="flex flex-col gap-3 rounded-lg border border-slate-200 p-6 transition hover:border-slate-900 hover:shadow-sm"
          >
            <h2 className="text-lg font-semibold">{option.title}</h2>
            <p className="grow text-sm leading-relaxed text-slate-600">{option.body}</p>
            <span className="text-sm font-semibold text-slate-900">{option.cta} →</span>
          </Link>
        ))}
      </div>

      <p className="text-sm text-slate-600">
        {t('alreadyHaveAccount')}{' '}
        <Link href="/login" className="font-semibold text-slate-900 underline">
          {t('signIn')}
        </Link>
      </p>
    </main>
  );
}
