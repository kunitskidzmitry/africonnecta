import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';

import { describe, expect, it } from 'vitest';

import { routing } from '@/i18n/routing';

const messagesDir = fileURLToPath(new URL('../messages/', import.meta.url));

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
    flattenKeys(nested, prefix ? `${prefix}.${key}` : key),
  );
}

function loadCatalogue(locale: string): unknown {
  return JSON.parse(readFileSync(`${messagesDir}${locale}.json`, 'utf-8'));
}

describe('message catalogues', () => {
  it('defines a default locale that is part of the locale list', () => {
    expect(routing.locales).toContain(routing.defaultLocale);
  });

  it.each(routing.locales)('has a catalogue file for locale "%s"', (locale) => {
    expect(existsSync(`${messagesDir}${locale}.json`)).toBe(true);
  });

  // Главный смысл этого теста: при добавлении второго языка (FR) забытый ключ
  // уронит сборку, а не превратится в пустую строку на проде.
  it.each(routing.locales)('catalogue "%s" has exactly the default locale keys', (locale) => {
    const expected = flattenKeys(loadCatalogue(routing.defaultLocale)).sort();
    const actual = flattenKeys(loadCatalogue(locale)).sort();

    const missing = expected.filter((key) => !actual.includes(key));
    const extra = actual.filter((key) => !expected.includes(key));

    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it('has no empty message values', () => {
    for (const locale of routing.locales) {
      const catalogue = loadCatalogue(locale) as Record<string, unknown>;
      const entries = JSON.stringify(catalogue);
      expect(entries).not.toContain('""');
    }
  });
});
