import { describe, expect, it } from 'vitest';

import type { ProfileLanguage } from '@/lib/profile/schema';
import {
  planProfileWrite,
  type ProfileWriteState,
  type ProfileWriteStep,
  type ProfileWriteTarget,
} from '@/lib/profile/write-plan';

/**
 * Инвариант: опубликованный профиль всегда имеет хотя бы одну область и один язык.
 *
 * Опубликованный профиль без связей не находится поиском (§6.3), то есть человек видит
 * «опубликовано» и не получает ни одного обращения. Транзакции на несколько таблиц
 * PostgREST не даёт, поэтому держит инвариант только порядок запросов, и проверять его
 * нужно не на результате сохранения, а на каждом промежуточном состоянии: любой шаг
 * может оказаться последним, если оборвётся соединение или упадёт процесс.
 *
 * Поэтому тест не «сохраняет и смотрит, что получилось», а прогоняет каждый префикс
 * плана и требует инвариант после каждого шага.
 */

const NOW = '2026-09-06T12:00:00.000Z';
const EARLIER = '2026-01-01T00:00:00.000Z';

/** Состояние трёх таблиц: experts.published_at, expert_expertise, expert_languages. */
type Snapshot = {
  publishedAt: string | null;
  expertise: Set<number>;
  languages: Map<number, string>;
};

function snapshotOf(state: ProfileWriteState, proficiency = 'b1'): Snapshot {
  return {
    publishedAt: state.publishedAt,
    expertise: new Set(state.expertiseIds),
    languages: new Map(state.languageIds.map((id) => [id, proficiency])),
  };
}

function apply(snapshot: Snapshot, step: ProfileWriteStep): Snapshot {
  const next: Snapshot = {
    publishedAt: snapshot.publishedAt,
    expertise: new Set(snapshot.expertise),
    languages: new Map(snapshot.languages),
  };

  switch (step.kind) {
    case 'fields':
      next.publishedAt = step.publishedAt;
      break;
    case 'publish':
      next.publishedAt = step.publishedAt;
      break;
    case 'addExpertise':
      for (const id of step.expertiseIds) next.expertise.add(id);
      break;
    case 'removeExpertise':
      for (const id of step.expertiseIds) next.expertise.delete(id);
      break;
    case 'addLanguages':
      for (const row of step.languages) next.languages.set(row.languageId, row.proficiency);
      break;
    case 'removeLanguages':
      for (const id of step.languageIds) next.languages.delete(id);
      break;
  }

  return next;
}

/** Читаемое описание состояния: иначе провал теста показывает `false !== true`. */
function describeSnapshot(snapshot: Snapshot): string {
  return [
    snapshot.publishedAt === null ? 'черновик' : 'опубликован',
    `области: [${[...snapshot.expertise].join(', ')}]`,
    `языки: [${[...snapshot.languages.keys()].join(', ')}]`,
  ].join(', ');
}

function language(languageId: number, proficiency: ProfileLanguage['proficiency']) {
  return { languageId, proficiency };
}

/**
 * Прогоняет план шаг за шагом, требуя инвариант после каждого, и возвращает итог.
 *
 * Заодно проверяет исходное состояние: сценарий, начатый из уже испорченного состояния,
 * доказывал бы не то, что план его сохраняет, а то, что он его не исправляет.
 */
function runPlan(current: ProfileWriteState, next: ProfileWriteTarget): Snapshot {
  const plan = planProfileWrite(current, next, NOW);
  let snapshot = snapshotOf(current);

  expect(intact(snapshot), `исходное состояние уже нарушает инвариант`).toBe(true);

  for (const [index, step] of plan.entries()) {
    snapshot = apply(snapshot, step);

    expect(
      intact(snapshot),
      `после шага ${index + 1}/${plan.length} (${step.kind}): ${describeSnapshot(snapshot)}`,
    ).toBe(true);
  }

  return snapshot;
}

function intact(snapshot: Snapshot): boolean {
  return (
    snapshot.publishedAt === null || (snapshot.expertise.size > 0 && snapshot.languages.size > 0)
  );
}

const draft: ProfileWriteState = { publishedAt: null, expertiseIds: [], languageIds: [] };
const published: ProfileWriteState = {
  publishedAt: EARLIER,
  expertiseIds: [10],
  languageIds: [1],
};

describe('план сохранения профиля не оставляет опубликованный профиль без связей', () => {
  it('черновик остаётся черновиком: связи можно опустошать свободно', () => {
    const result = runPlan(
      { publishedAt: null, expertiseIds: [10], languageIds: [1] },
      { published: false, expertiseIds: [], languages: [] },
    );

    expect(result.publishedAt).toBeNull();
    expect(result.expertise.size).toBe(0);
    expect(result.languages.size).toBe(0);
  });

  it('черновик публикуется: published_at ставится последним шагом', () => {
    const result = runPlan(draft, {
      published: true,
      expertiseIds: [10, 11],
      languages: [language(1, 'native')],
    });

    expect(result.publishedAt).toBe(NOW);
    expect([...result.expertise]).toEqual([10, 11]);
    expect([...result.languages]).toEqual([[1, 'native']]);
  });

  /**
   * Тот случай, из-за которого план вынесен в отдельную функцию.
   *
   * Порядок «сначала удалить, потом вставить» проходит все проверки результата и рушится
   * только здесь: набор заменён целиком, публикация не снималась, и между удалением
   * и вставкой опубликованный профиль пуст.
   */
  it('опубликованный профиль заменяет все области и языки целиком', () => {
    const result = runPlan(published, {
      published: true,
      expertiseIds: [20],
      languages: [language(2, 'c1')],
    });

    expect(result.publishedAt).toBe(EARLIER);
    expect([...result.expertise]).toEqual([20]);
    expect([...result.languages]).toEqual([[2, 'c1']]);
  });

  it('опубликованный профиль меняет уровень языка, не задевая состав', () => {
    const result = runPlan(published, {
      published: true,
      expertiseIds: [10],
      languages: [language(1, 'c2')],
    });

    expect(result.publishedAt).toBe(EARLIER);
    expect([...result.languages]).toEqual([[1, 'c2']]);
  });

  it('публикация снимается вместе с очисткой связей', () => {
    const result = runPlan(published, { published: false, expertiseIds: [], languages: [] });

    expect(result.publishedAt).toBeNull();
    expect(result.expertise.size).toBe(0);
    expect(result.languages.size).toBe(0);
  });

  it('снятый с публикации профиль публикуется заново с новым временем', () => {
    const result = runPlan(
      { publishedAt: null, expertiseIds: [10], languageIds: [1] },
      { published: true, expertiseIds: [10], languages: [language(1, 'b1')] },
    );

    expect(result.publishedAt).toBe(NOW);
  });
});

describe('порядок шагов', () => {
  const kinds = planProfileWrite(
    published,
    { published: true, expertiseIds: [20], languages: [language(2, 'c1')] },
    NOW,
  ).map((step) => step.kind);

  it('вставки идут перед удалениями', () => {
    // Обратный порядок опустошает набор при полной замене — ровно то, что проверяет
    // «заменяет все области и языки целиком» выше. Здесь то же требование записано
    // как утверждение о плане: так провал сразу показывает причину, а не следствие.
    const lastAdd = Math.max(kinds.lastIndexOf('addExpertise'), kinds.lastIndexOf('addLanguages'));
    const firstRemove = Math.min(
      ...(['removeExpertise', 'removeLanguages'] as const)
        .map((kind) => kinds.indexOf(kind))
        .filter((index) => index >= 0),
    );

    expect(lastAdd).toBeGreaterThanOrEqual(0);
    expect(firstRemove).toBeGreaterThan(lastAdd);
  });

  it('правка колонок идёт первой, публикация — последней', () => {
    expect(kinds[0]).toBe('fields');

    const publishing = planProfileWrite(
      draft,
      { published: true, expertiseIds: [10], languages: [language(1, 'b1')] },
      NOW,
    );

    expect(publishing[0]?.kind).toBe('fields');
    expect(publishing.at(-1)?.kind).toBe('publish');
  });

  it('лишних запросов нет: без изменений в связях остаётся один шаг', () => {
    const plan = planProfileWrite(
      { publishedAt: null, expertiseIds: [], languageIds: [] },
      { published: false, expertiseIds: [], languages: [] },
      NOW,
    );

    expect(plan).toEqual([{ kind: 'fields', publishedAt: null }]);
  });
});
