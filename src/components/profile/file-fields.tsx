import { getTranslations } from 'next-intl/server';

import { ALLOWED_FORMATS, MAX_BYTES, type FileKind } from '@/lib/files/format';
import type { FileFailure } from '@/lib/files/store';

/**
 * Фотография и CV на странице профиля.
 *
 * Отдельные формы, а не поля основной формы профиля, и не по стилистическим причинам:
 * form внутри form — недопустимая разметка, браузер выбрасывает вложенную. Отправка тоже
 * раздельная: файл уходит обработчику маршрута (api/files/upload), остальной профиль —
 * server action.
 *
 * Побочная выгода в поведении: файл сохраняется сам по себе и не ждёт остальную форму.
 * Загрузить фотографию и не заметить, что профиль не сохранён из-за ошибки в другом поле,
 * невозможно.
 *
 * Серверный компонент без 'use client': интерактивного здесь нет ничего, всё делает
 * обычная разметка. Поэтому и без JavaScript работает.
 */
export async function ProfileFileFields({
  locale,
  photoFileId,
  cvFileId,
  saved,
  errorKey,
  errorKind,
}: {
  locale: string;
  photoFileId: string | null;
  cvFileId: string | null;
  saved: FileKind | null;
  errorKey: FileFailure['reason'] | null;
  errorKind: FileKind | null;
}) {
  const t = await getTranslations('Profile');

  const rows = [
    { kind: 'photo', fileId: photoFileId },
    { kind: 'cv', fileId: cvFileId },
  ] as const;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b border-slate-200 pb-2 text-lg font-semibold text-slate-900">
        {t('sectionFiles')}
      </h2>

      {rows.map(({ kind, fileId }) => (
        <FileRow
          key={kind}
          kind={kind}
          locale={locale}
          fileId={fileId}
          saved={saved === kind}
          errorKey={errorKind === kind ? errorKey : null}
        />
      ))}
    </section>
  );
}

async function FileRow({
  kind,
  locale,
  fileId,
  saved,
  errorKey,
}: {
  kind: FileKind;
  locale: string;
  fileId: string | null;
  saved: boolean;
  errorKey: FileFailure['reason'] | null;
}) {
  const t = await getTranslations('Profile');

  // accept — подсказка диалогу выбора файла, а не проверка: он приходит от браузера
  // и меняется так же легко, как расширение. Проверяет сигнатура на сервере.
  const accept = ALLOWED_FORMATS[kind].map((format) => format.mime).join(',');
  const limit = String(Math.round(MAX_BYTES[kind] / (1024 * 1024)));

  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 p-4">
      <div className="flex items-center gap-4">
        {fileId ? <Preview kind={kind} fileId={fileId} alt={t('photoPreviewAlt')} /> : null}

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-800">
            {kind === 'photo' ? t('fieldPhoto') : t('fieldCv')}
          </span>
          <span className="text-xs text-slate-500">
            {kind === 'photo' ? t('photoHint', { limit }) : t('cvHint', { limit })}
          </span>
        </div>
      </div>

      {errorKey ? (
        <p role="alert" className="text-xs font-medium text-red-600">
          {t(`fileErrors.${errorKey}`)}
        </p>
      ) : null}

      {saved ? (
        <p role="status" className="text-xs font-medium text-emerald-700">
          {t('fileSaved')}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {/* Вид файла и локаль — в адресе, а не скрытыми полями: при method="post" браузер
            сохраняет query из action, зато поля формы обработчик прочитает только вместе
            с телом. Из адреса они известны раньше, и отказ по размеру успевает вернуться
            на страницу сообщением вместо голого 413. */}
        <form
          method="post"
          action={`/api/files/upload?kind=${kind}&locale=${locale}`}
          encType="multipart/form-data"
          className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center"
        >
          <label htmlFor={`file-${kind}`} className="sr-only">
            {kind === 'photo' ? t('fieldPhoto') : t('fieldCv')}
          </label>
          <input
            id={`file-${kind}`}
            type="file"
            name="file"
            accept={accept}
            required
            className="max-w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2.5 file:text-sm file:font-semibold file:text-slate-800"
          />
          <button
            type="submit"
            className="min-h-11 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 sm:w-auto"
          >
            {fileId ? t('fileReplace') : t('fileUpload')}
          </button>
        </form>

        {fileId ? (
          <form
            method="post"
            action={`/api/files/upload?kind=${kind}&locale=${locale}&intent=remove`}
          >
            <button type="submit" className="text-sm text-slate-500 underline hover:text-red-700">
              {t('fileRemove')}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Показ уже загруженного файла.
 *
 * Оба адреса ведут в /api/files/[id], который перенаправляет на подписанную ссылку
 * хранилища. Прямой ссылки на объект в разметке нет и быть не может: она живёт минуты
 * и зависит от того, кто смотрит.
 */
async function Preview({ kind, fileId, alt }: { kind: FileKind; fileId: string; alt: string }) {
  const t = await getTranslations('Profile');

  if (kind === 'cv') {
    return (
      <a href={`/api/files/${fileId}`} className="text-sm font-medium text-slate-900 underline">
        {t('cvDownload')}
      </a>
    );
  }

  // next/image здесь не подходит: он просит либо размеры, либо домен в конфиге, а адрес
  // отвечает редиректом на чужой домен с коротким временем жизни — оптимизировать такое
  // нечем. Размер задаёт вёрстка, поэтому и обычный img не сдвинет разметку при загрузке.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/files/${fileId}`} alt={alt} className="size-20 rounded-full object-cover" />
  );
}
