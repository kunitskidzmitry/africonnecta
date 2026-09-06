/**
 * Снятие метаданных с фотографии (§7, «удаление EXIF из фото»).
 *
 * Требование про приватность, а не про размер: EXIF камеры телефона несёт координаты
 * съёмки, время и модель устройства. Человек, ставящий фотографию в профиль, соглашается
 * показать лицо, а не адрес, откуда он её снял, — по §2.3 это персональные данные,
 * собранные сверх необходимого.
 *
 * Метаданные вырезаются посегментно, файл не перекодируется. Перекодирование через sharp
 * надёжнее — оно уничтожает вообще всё, включая то, о чём мы не подумали, — но приносит
 * нативный бинарник в сборку. Разбор двух форматов, у которых структура сегментов описана
 * в стандарте, тестируется точнее, чем «доверимся кодировщику»: тест проверяет, что байты
 * APP1 исчезли, а пиксельные данные остались теми же байтами. Разбор в ADR-0008.
 *
 * Побочный и важный эффект: обрезается всё, что дописано после конца изображения. Это
 * самый простой способ спрятать в «фотографии» полезную нагрузку — ZIP или HTML за EOI, —
 * и с ним ничего не делают ни проверка сигнатуры (начало файла правильное), ни просмотр
 * глазами (картинка открывается).
 *
 * PDF остаётся как есть. Его метаданные — это чаще всего имя автора в собственном CV,
 * то есть то, что человек и собирался показать; вырезать их значило бы разбирать
 * структуру документа, а это отдельная работа с отдельным риском сломать файл. §7
 * снятия метаданных с PDF не требует.
 */

import type { FileFormat } from '@/lib/files/format';

/**
 * Маркеры JPEG, которые вырезаются.
 *
 * APP1 — EXIF и XMP, главная цель. APP13 — блок Photoshop с IPTC: автор, город, права.
 * APP3–APP12 и APP15 используются редко и разными вендорами под свои описания снимка;
 * приложениям для показа картинки они не нужны.
 *
 * Остаются три: APP0 (JFIF, плотность точек), APP2 (профиль ICC — без него у части
 * файлов уезжает цвет) и APP14 (Adobe, преобразование цвета для CMYK). Персональных
 * данных в них нет, а вреда от их удаления больше, чем пользы.
 */
function isDroppedJpegMarker(marker: number): boolean {
  if (marker === 0xfe) return true; // COM — свободный текстовый комментарий
  if (marker === 0xe1) return true; // APP1 — EXIF, XMP
  if (marker === 0xed) return true; // APP13 — Photoshop IRB, IPTC
  if (marker >= 0xe3 && marker <= 0xec) return true; // APP3..APP12
  if (marker === 0xef) return true; // APP15

  return false;
}

/** Чанки PNG, которые вырезаются: текстовые описания, EXIF и время правки. */
const DROPPED_PNG_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
}

/**
 * Ищет конец изображения, начиная с указанной позиции.
 *
 * Внутри сжатых данных FF D9 встретиться не может: байт FF в потоке экранируется
 * как FF 00, а из настоящих маркеров внутри скана допустимы только RST0–RST7
 * (FF D0 – FF D7). Поэтому первый же FF D9 после начала скана — это именно EOI.
 */
function findEndOfImage(bytes: Uint8Array, from: number): number | null {
  for (let i = from; i + 1 < bytes.length; i += 1) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) return i + 2;
  }

  return null;
}

function stripJpeg(bytes: Uint8Array): Uint8Array | null {
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;

  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) return null;

    // Между сегментами разрешены байты-заполнители FF. Пропускаем их до маркера.
    if (bytes[i + 1] === 0xff) {
      i += 1;
      continue;
    }

    const marker = bytes[i + 1];

    if (marker === undefined) return null;

    // EOI: дальше по стандарту ничего нет, и всё, что там оказалось, дописано кем-то.
    if (marker === 0xd9) {
      kept.push(bytes.subarray(i, i + 2));
      return concat(kept);
    }

    // SOS: за ним идут сжатые данные, разбирать их незачем — копируются до EOI.
    if (marker === 0xda) {
      const end = findEndOfImage(bytes, i + 2);

      kept.push(bytes.subarray(i, end ?? bytes.length));
      return concat(kept);
    }

    // Маркеры без полезной нагрузки: TEM и RST0–RST7.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      kept.push(bytes.subarray(i, i + 2));
      i += 2;
      continue;
    }

    const high = bytes[i + 2];
    const low = bytes[i + 3];

    if (high === undefined || low === undefined) return null;

    // Длина считает сами два байта длины, поэтому меньше двух её быть не может.
    const length = (high << 8) | low;

    if (length < 2 || i + 2 + length > bytes.length) return null;

    if (!isDroppedJpegMarker(marker)) {
      kept.push(bytes.subarray(i, i + 2 + length));
    }

    i += 2 + length;
  }

  // Файл кончился, не дойдя до скана: структура сломана, и притворяться,
  // что мы её поняли, хуже, чем отказать.
  return null;
}

function stripPng(bytes: Uint8Array): Uint8Array | null {
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 8;

  while (i + 8 <= bytes.length) {
    const length = view.getUint32(i);
    // Длина чанка плюс четыре байта длины, четыре типа и четыре контрольной суммы.
    const total = length + 12;

    if (i + total > bytes.length) return null;

    const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));

    if (!DROPPED_PNG_CHUNKS.has(type)) {
      kept.push(bytes.subarray(i, i + total));
    }

    if (type === 'IEND') return concat(kept);

    i += total;
  }

  return null;
}

/**
 * Файл без метаданных или null, если структура не разбирается.
 *
 * Контрольные суммы PNG не пересчитываются, и это не упущение: чанк удаляется целиком
 * вместе со своей суммой, а суммы соседей считаются каждая по себе и от удаления
 * соседа не меняются.
 *
 * Проверено не только сборными файлами из tests/file-metadata.test.ts. На фотографии
 * 3840×2160, которой sips проставил artist и copyright: после обработки sips читает
 * те же размеры и тот же профиль sRGB, а artist и copyright не показывает вовсе.
 * То же на PNG той же картинки.
 */
export function stripMetadata(bytes: Uint8Array, format: FileFormat): Uint8Array | null {
  if (format.mime === 'image/jpeg') return stripJpeg(bytes);
  if (format.mime === 'image/png') return stripPng(bytes);

  return bytes;
}
