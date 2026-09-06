import { describe, expect, it } from 'vitest';

import { parseFileFailure, parseFileKind } from '@/lib/files/feedback';

describe('parseFileKind', () => {
  it('принимает известный вид', () => {
    expect(parseFileKind('photo')).toBe('photo');
    expect(parseFileKind('cv')).toBe('cv');
  });

  it('отбрасывает всё остальное', () => {
    expect(parseFileKind('avatar')).toBeNull();
    expect(parseFileKind('')).toBeNull();
    expect(parseFileKind(undefined)).toBeNull();
    expect(parseFileKind(['photo', 'cv'])).toBe('photo');
  });
});

describe('parseFileFailure', () => {
  it('принимает ключ из каталога ошибок', () => {
    expect(parseFileFailure('tooLarge')).toBe('tooLarge');
    expect(parseFileFailure('malformed')).toBe('malformed');
  });

  it('не пропускает произвольный текст в разметку', () => {
    expect(parseFileFailure('<script>')).toBeNull();
    expect(parseFileFailure('fileEmpty')).toBeNull();
  });
});
