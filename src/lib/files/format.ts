/**
 * Что за файл — по содержимому, а не по имени.
 *
 * §7 требует «whitelist MIME с проверкой сигнатуры файла, а не расширения». Расширение
 * и заголовок Content-Type присылает тот, кто загружает файл, то есть ровно та сторона,
 * от которой проверка защищает. Единственное, что нельзя подделать, не изменив сам файл, —
 * первые байты.
 *
 * Список закрытый и короткий: две картинки и PDF. Каждый новый формат — это новый разбор
 * в stripMetadata и новый способ спрятать в файле то, что браузер потом исполнит,
 * поэтому расширять его нужно по одному и с тестом на каждый.
 */

export const FILE_KINDS = ['photo', 'cv'] as const;

export type FileKind = (typeof FILE_KINDS)[number];

export type FileFormat = {
  mime: 'image/jpeg' | 'image/png' | 'application/pdf';
  /** Расширение в ключе хранилища. Только для читаемости ключа, правами не управляет. */
  extension: 'jpg' | 'png' | 'pdf';
};

const JPEG: FileFormat = { mime: 'image/jpeg', extension: 'jpg' };
const PNG: FileFormat = { mime: 'image/png', extension: 'png' };
const PDF: FileFormat = { mime: 'application/pdf', extension: 'pdf' };

/**
 * Какие форматы допустимы для какого вида файла.
 *
 * Фотография-PDF и CV-картинкой отклоняются не из вкуса: карточка эксперта показывает
 * фотографию тегом img, а PDF в него не поставить, и «CV» из фотографии страницы
 * не читается ни человеком, ни будущим разбором текста.
 */
export const ALLOWED_FORMATS: Record<FileKind, FileFormat[]> = {
  photo: [JPEG, PNG],
  cv: [PDF],
};

/**
 * Предельный размер.
 *
 * Фотографии хватает двух мегабайт: в карточке она занимает меньше двухсот пикселей.
 * CV — пять, столько же принимает бакет (миграция 20260906230000). Числа не из §7,
 * он лимит требует, но не называет; при пересмотре менять надо оба места.
 */
export const MAX_BYTES: Record<FileKind, number> = {
  photo: 2 * 1024 * 1024,
  cv: 5 * 1024 * 1024,
};

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;

  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * Формат по сигнатуре или null, если он не из списка.
 *
 * PDF ищется строго в начале файла, хотя стандарт разрешает заголовок в первом килобайте.
 * Строгость намеренная: файл, у которого перед `%PDF-` лежит что-то ещё, — это
 * или мусор, или полиглот, и принимать его незачем.
 */
export function detectFormat(bytes: Uint8Array): FileFormat | null {
  // FF D8 FF — SOI и начало первого маркера. Двух байт SOI мало: с них начинается
  // слишком много случайного мусора.
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return JPEG;

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return PNG;

  // '%PDF-'
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return PDF;

  return null;
}

export type FileRejection =
  | { reason: 'empty' }
  | { reason: 'tooLarge'; limit: number }
  | { reason: 'unsupportedFormat' }
  | { reason: 'formatMismatch'; detected: FileFormat };

export type FileAcceptance = { format: FileFormat };

/**
 * Годится ли этот файл для этого места профиля.
 *
 * Возвращает причину отказа, а не бросает исключение: причина показывается человеку
 * рядом с полем, и различать «слишком большой» и «не тот формат» он должен сам,
 * иначе останется гадать, что исправить.
 */
export function inspectUpload(
  bytes: Uint8Array,
  kind: FileKind,
): FileAcceptance | { rejected: FileRejection } {
  if (bytes.length === 0) return { rejected: { reason: 'empty' } };

  const limit = MAX_BYTES[kind];

  if (bytes.length > limit) return { rejected: { reason: 'tooLarge', limit } };

  const format = detectFormat(bytes);

  if (!format) return { rejected: { reason: 'unsupportedFormat' } };

  const allowed = ALLOWED_FORMATS[kind].some((candidate) => candidate.mime === format.mime);

  if (!allowed) return { rejected: { reason: 'formatMismatch', detected: format } };

  return { format };
}

/** Ключ объекта в бакете. Первый сегмент — владелец, второй — вид: так устроены политики. */
export function storageKey(userId: string, kind: FileKind, fileId: string, format: FileFormat) {
  return `${userId}/${kind}/${fileId}.${format.extension}`;
}
