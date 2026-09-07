import { getTranslations, setRequestLocale } from 'next-intl/server';

/**
 * Экран после отправки формы.
 *
 * Текст намеренно условный («если адрес ещё не зарегистрирован»): страница показывается
 * одинаково и для нового адреса, и для уже занятого. Иначе по реакции формы можно было бы
 * перебором выяснить, кто зарегистрирован на платформе.
 *
 * Адрес почты здесь не показывается и в URL не передаётся: он попал бы в журналы сервера
 * и в заголовок Referer при переходе по внешним ссылкам.
 */
export default async function CheckEmailPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Register');

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center gap-4 px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-2xl font-bold tracking-tight">{t('checkEmailTitle')}</h1>
      <p className="leading-relaxed text-slate-600">{t('checkEmailBody')}</p>
      <p className="rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-500">
        {t('checkEmailHint')}
      </p>
    </main>
  );
}
