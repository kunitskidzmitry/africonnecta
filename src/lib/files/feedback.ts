import { FILE_KINDS, type FileKind } from '@/lib/files/format';
import type { FileFailure } from '@/lib/files/store';

/**
 * Разбор того, что обработчик загрузки положил в адрес.
 *
 * Ответ на форму без JavaScript — это редирект, и единственное место, куда можно
 * положить результат, — строка запроса. Значит, значения приходят от браузера и
 * подставляются в разметку, то есть проверять их обязательно: без списка в шаблон
 * попадал бы произвольный текст по чужой ссылке.
 *
 * Record<..., true> вместо массива строк: он проверяется на полноту. Новая причина
 * отказа в FileFailure уронит сборку здесь, а не тихо превратится в пустое место
 * на странице.
 */
const REASONS: Record<FileFailure['reason'], true> = {
  empty: true,
  tooLarge: true,
  unsupportedFormat: true,
  formatMismatch: true,
  malformed: true,
  storage: true,
};

/** Первый скаляр из searchParams: Next отдаёт string | string[] | undefined. */
function first(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

export function parseFileFailure(value: unknown): FileFailure['reason'] | null {
  const raw = first(value);
  return raw && raw in REASONS ? (raw as FileFailure['reason']) : null;
}

export function parseFileKind(value: unknown): FileKind | null {
  const raw = first(value);
  return raw && (FILE_KINDS as readonly string[]).includes(raw) ? (raw as FileKind) : null;
}
