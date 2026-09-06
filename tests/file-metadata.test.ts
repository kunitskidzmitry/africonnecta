import { describe, expect, it } from 'vitest';

import { detectFormat, inspectUpload, MAX_BYTES } from '@/lib/files/format';
import { stripMetadata } from '@/lib/files/metadata';

/**
 * Проверка сигнатуры и снятие метаданных (§7).
 *
 * Файлы здесь собираются побайтово, а не берутся из фикстур-картинок. Причина не в весе
 * репозитория: настоящая фотография не даёт сказать, что именно проверяет тест. Собранный
 * вручную JPEG позволяет утверждать точно — вот эти байты были EXIF и их не стало,
 * а вот эти были сжатым изображением и они те же.
 */

const JPEG_SOI = [0xff, 0xd8, 0xff];

/** Сегмент с двухбайтовой длиной: FF <маркер> <длина+2> <данные>. */
function segment(marker: number, data: number[]): number[] {
  const length = data.length + 2;

  return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...data];
}

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

/** EXIF всегда начинается с 'Exif\0\0'. Дальше здесь лежит узнаваемый мусор. */
const EXIF_PAYLOAD = [...ascii('Exif'), 0x00, 0x00, ...ascii('GPS 1.234 5.678')];
const ICC_PAYLOAD = [...ascii('ICC_PROFILE'), 0x00, 0x01, 0x02];
const SCAN_DATA = [0x12, 0x34, 0x56, 0x78, 0x9a];

function jpegWith(segments: number[][], trailer: number[] = []): Uint8Array {
  return new Uint8Array([
    ...JPEG_SOI.slice(0, 2),
    ...segments.flat(),
    ...segment(0xda, [0x00, 0x01]),
    ...SCAN_DATA,
    0xff,
    0xd9,
    ...trailer,
  ]);
}

/** Чанк PNG: длина, тип, данные, место под контрольную сумму. */
function chunk(type: string, data: number[] = []): number[] {
  const length = data.length;

  return [
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...ascii(type),
    ...data,
    0xde,
    0xad,
    0xbe,
    0xef,
  ];
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngWith(chunks: number[][], trailer: number[] = []): Uint8Array {
  return new Uint8Array([...PNG_SIGNATURE, ...chunks.flat(), ...chunk('IEND'), ...trailer]);
}

function contains(haystack: Uint8Array, needle: number[]): boolean {
  const text = [...haystack].join(',');

  return text.includes(needle.join(','));
}

// ---------------------------------------------------------------------------
// Опознание формата
// ---------------------------------------------------------------------------

describe('detectFormat', () => {
  it('узнаёт JPEG, PNG и PDF по первым байтам', () => {
    expect(detectFormat(new Uint8Array(JPEG_SOI))?.mime).toBe('image/jpeg');
    expect(detectFormat(new Uint8Array(PNG_SIGNATURE))?.mime).toBe('image/png');
    expect(detectFormat(new Uint8Array(ascii('%PDF-1.7')))?.mime).toBe('application/pdf');
  });

  it('не узнаёт то, чего нет в списке', () => {
    expect(detectFormat(new Uint8Array(ascii('<!DOCTYPE html>')))).toBeNull();
    expect(detectFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBeNull(); // ZIP
    expect(detectFormat(new Uint8Array([0x7f, 0x45, 0x4c, 0x46]))).toBeNull(); // ELF
    expect(detectFormat(new Uint8Array())).toBeNull();
  });

  /**
   * Ровно тот случай, ради которого §7 требует проверять содержимое: имя и заголовок
   * говорят «фотография», внутри — разметка. Ни расширение, ни Content-Type
   * этого не показывают, потому что и то и другое присылает загружающий.
   */
  it('не принимает HTML, названный фотографией', () => {
    const html = new Uint8Array(ascii('<html><script>alert(1)</script></html>'));

    expect(inspectUpload(html, 'photo')).toEqual({ rejected: { reason: 'unsupportedFormat' } });
  });

  it('не принимает PDF на месте фотографии и картинку на месте CV', () => {
    const pdf = new Uint8Array(ascii('%PDF-1.7'));
    const jpeg = new Uint8Array(JPEG_SOI);

    expect(inspectUpload(pdf, 'photo')).toEqual({
      rejected: {
        reason: 'formatMismatch',
        detected: { mime: 'application/pdf', extension: 'pdf' },
      },
    });
    expect(inspectUpload(jpeg, 'cv')).toEqual({
      rejected: { reason: 'formatMismatch', detected: { mime: 'image/jpeg', extension: 'jpg' } },
    });
  });

  it('отклоняет пустой файл и файл сверх лимита', () => {
    const big = new Uint8Array(MAX_BYTES.photo + 1);
    big.set(JPEG_SOI);

    expect(inspectUpload(new Uint8Array(), 'photo')).toEqual({ rejected: { reason: 'empty' } });
    expect(inspectUpload(big, 'photo')).toEqual({
      rejected: { reason: 'tooLarge', limit: MAX_BYTES.photo },
    });
  });
});

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

describe('stripMetadata, JPEG', () => {
  const format = { mime: 'image/jpeg', extension: 'jpg' } as const;

  it('вырезает EXIF и оставляет изображение', () => {
    const original = jpegWith([segment(0xe1, EXIF_PAYLOAD)]);
    const stripped = stripMetadata(original, format);

    expect(stripped).not.toBeNull();
    expect(contains(original, EXIF_PAYLOAD), 'фикстура собрана неверно, EXIF в ней нет').toBe(true);
    expect(contains(stripped!, EXIF_PAYLOAD), 'координаты съёмки остались в файле').toBe(false);
    expect(contains(stripped!, SCAN_DATA), 'вместе с EXIF потерялось изображение').toBe(true);
    expect([...stripped!.subarray(0, 2)]).toEqual([0xff, 0xd8]);
  });

  it('вырезает комментарий и блок Photoshop, оставляет профиль ICC', () => {
    const comment = ascii('Snapped at home');
    const photoshop = ascii('Photoshop 3.0 IPTC city');
    const original = jpegWith([
      segment(0xe0, ascii('JFIF')),
      segment(0xe2, ICC_PAYLOAD),
      segment(0xed, photoshop),
      segment(0xfe, comment),
    ]);
    const stripped = stripMetadata(original, format);

    expect(contains(stripped!, comment)).toBe(false);
    expect(contains(stripped!, photoshop)).toBe(false);
    expect(contains(stripped!, ICC_PAYLOAD), 'без профиля ICC у части файлов уезжает цвет').toBe(
      true,
    );
  });

  /**
   * Дописанное после конца изображения пропадает.
   *
   * Так прячут полезную нагрузку в файле, который открывается как картинка: проверка
   * сигнатуры смотрит начало, глаз смотрит на изображение, а за EOI лежит архив.
   */
  it('обрезает всё, что дописано после конца изображения', () => {
    const payload = ascii('PK\u0003\u0004malicious.zip');
    const original = jpegWith([segment(0xe1, EXIF_PAYLOAD)], payload);
    const stripped = stripMetadata(original, format);

    expect(contains(original, payload)).toBe(true);
    expect(contains(stripped!, payload), 'дописанный за EOI архив остался в файле').toBe(false);
    expect([...stripped!.subarray(-2)]).toEqual([0xff, 0xd9]);
  });

  it('отказывается разбирать сломанную структуру', () => {
    // Длина сегмента больше самого файла: дальше читать нечего.
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0x01, 0x02]);

    expect(stripMetadata(broken, format)).toBeNull();
  });

  it('не портит файл без метаданных', () => {
    const clean = jpegWith([segment(0xe0, ascii('JFIF'))]);

    expect([...stripMetadata(clean, format)!]).toEqual([...clean]);
  });
});

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

describe('stripMetadata, PNG', () => {
  const format = { mime: 'image/png', extension: 'png' } as const;
  const pixels = [0x08, 0x1d, 0x63, 0x60];

  it('вырезает текстовые чанки и EXIF, оставляет изображение', () => {
    const text = ascii('Author\u0000Yves Habimana');
    const exif = ascii('II*\u0000GPS');
    const original = pngWith([
      chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
      chunk('tEXt', text),
      chunk('eXIf', exif),
      chunk('IDAT', pixels),
    ]);
    const stripped = stripMetadata(original, format);

    expect(contains(original, text)).toBe(true);
    expect(contains(stripped!, text), 'имя автора осталось в файле').toBe(false);
    expect(contains(stripped!, exif), 'EXIF остался в файле').toBe(false);
    expect(contains(stripped!, pixels), 'вместе с метаданными потерялось изображение').toBe(true);
    expect([...stripped!.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  });

  it('оставляет цветовые чанки', () => {
    const icc = ascii('sRGB profile');
    const original = pngWith([
      chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
      chunk('iCCP', icc),
      chunk('IDAT', pixels),
    ]);

    expect(contains(stripMetadata(original, format)!, icc)).toBe(true);
  });

  it('обрезает дописанное после IEND', () => {
    const payload = ascii('<script>alert(1)</script>');
    const original = pngWith(
      [chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]), chunk('IDAT', pixels)],
      payload,
    );
    const stripped = stripMetadata(original, format);

    expect(contains(original, payload)).toBe(true);
    expect(contains(stripped!, payload)).toBe(false);
    expect([...stripped!.subarray(-8, -4)]).toEqual(ascii('IEND'));
  });

  it('отказывается разбирать файл без IEND', () => {
    const broken = new Uint8Array([...PNG_SIGNATURE, ...chunk('IDAT', pixels)]);

    expect(stripMetadata(broken, format)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

describe('stripMetadata, PDF', () => {
  it('оставляет PDF без изменений', () => {
    const pdf = new Uint8Array(ascii('%PDF-1.7\n1 0 obj\n<< /Author (Yves) >>'));

    expect([...stripMetadata(pdf, { mime: 'application/pdf', extension: 'pdf' })!]).toEqual([
      ...pdf,
    ]);
  });
});
