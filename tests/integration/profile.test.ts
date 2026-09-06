import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/lib/database.types';
import {
  planProfileWrite,
  runProfileWriteStep,
  type ProfileColumns,
} from '@/lib/profile/write-plan';

import { anon, signInAs, SEED_PASSWORD } from './local-stack';

/**
 * Вход и правка собственного профиля эксперта.
 *
 * Матрица доступа уже проверяет, что чужой профиль не правится. Здесь —
 * путь, которым пользуется экран /profile: вход паролем из сида, чтение
 * телефона через my_expert_profile (не через select phone), запись
 * экспертизы и языков. Гость эти двери не открывает.
 */

const EXPERT_PUBLIC = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const EXPERT_DRAFT = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

/** Тот же ключ конфликта, что использует updateOwnExpertProfile. */
const LANGUAGE_CONFLICT = { onConflict: 'expert_id,language_id' };

let expert: SupabaseClient<Database>;
let draftExpert: SupabaseClient<Database>;
let otherExpert: SupabaseClient<Database>;

beforeAll(async () => {
  expert = await signInAs('expert@example.test');
  draftExpert = await signInAs('expert.draft@example.test');
  otherExpert = await signInAs('expert.hidden@example.test');
});

afterAll(async () => {
  await Promise.all([
    expert.auth.signOut(),
    draftExpert.auth.signOut(),
    otherExpert.auth.signOut(),
  ]);
});

describe('вход', () => {
  it('засеянный эксперт входит паролем короче 12 символов', async () => {
    const { data, error } = await anon().auth.signInWithPassword({
      email: 'expert@example.test',
      password: SEED_PASSWORD,
    });

    expect(error).toBeNull();
    expect(data.user?.email).toBe('expert@example.test');
  });

  // signIn разбирает ошибку по error.code, а не по английскому тексту сообщения.
  // Если GoTrue сменит код, форма молча начнёт показывать «что-то пошло не так»,
  // поэтому код зафиксирован здесь.
  it('неверный пароль и несуществующий адрес неотличимы: один код invalid_credentials', async () => {
    const wrongPassword = await anon().auth.signInWithPassword({
      email: 'expert@example.test',
      password: 'definitely-wrong',
    });
    const noSuchUser = await anon().auth.signInWithPassword({
      email: `nobody.${Date.now()}@example.test`,
      password: 'definitely-wrong',
    });

    expect(wrongPassword.error?.code).toBe('invalid_credentials');
    expect(noSuchUser.error?.code).toBe('invalid_credentials');
    expect(noSuchUser.error?.message).toBe(wrongPassword.error?.message);
  });
});

describe('собственный профиль', () => {
  it('владелец читает телефон через my_expert_profile, а не через select', async () => {
    const { data, error } = await expert.rpc('my_expert_profile');

    expect(error).toBeNull();
    expect(data?.[0]).toMatchObject({
      id: EXPERT_PUBLIC,
      first_name: 'Yves',
      phone: '+250788123456',
    });

    const direct = await expert.from('experts').select('id, phone').eq('id', EXPERT_PUBLIC);
    expect(direct.error).not.toBeNull();
  });

  /**
   * Гость функцию ВЫЗЫВАЕТ и получает пустой список.
   *
   * Отказа нет, хотя миграция и пишет `grant execute ... to authenticated`: PostgreSQL
   * по умолчанию выдаёт execute роли PUBLIC, а revoke в миграции 20260906180100
   * отсутствует. То есть грант декоративен, и дверь держит не он, а фильтр
   * `where e.user_id = auth.uid()` внутри тела — у гостя uid пуст, строк нет.
   *
   * Утечки это не даёт, но противоречит «deny by default» из AGENTS.md: следующая
   * security definer функция, написанная по этому образцу, но без фильтра по uid,
   * окажется открытой всему интернету. Тест фиксирует факт, а не одобряет его.
   */
  it('гость вызывает my_expert_profile, но не получает ни одной строки', async () => {
    const { data, error } = await anon().rpc('my_expert_profile');

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  /**
   * updateOwnExpertProfile обновляет уровень уже указанного языка через upsert
   * с onConflict: 'expert_id,language_id'. Работает это только пока пара остаётся
   * уникальной. Пропади ограничение — upsert начнёт молча плодить дубли строк,
   * и профиль покажет один язык дважды с разными уровнями.
   */
  it('upsert по языку меняет уровень, а не добавляет вторую строку', async () => {
    const { data: english } = await expert
      .from('languages')
      .select('id')
      .eq('name', 'English')
      .single();

    if (!english) throw new Error('В справочнике нет English');

    const row = { expert_id: EXPERT_PUBLIC, language_id: english.id };

    const first = await expert
      .from('expert_languages')
      .upsert({ ...row, proficiency: 'b1' }, LANGUAGE_CONFLICT);
    const second = await expert
      .from('expert_languages')
      .upsert({ ...row, proficiency: 'c2' }, LANGUAGE_CONFLICT);

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();

    const { data } = await expert
      .from('expert_languages')
      .select('proficiency')
      .eq('expert_id', EXPERT_PUBLIC)
      .eq('language_id', english.id);

    expect(data).toEqual([{ proficiency: 'c2' }]);
  });

  it('владелец обновляет биографию', async () => {
    const bio = `Профиль ${Date.now()}`;
    const { data, error } = await expert
      .from('experts')
      .update({ bio })
      .eq('id', EXPERT_PUBLIC)
      .select('id, bio');

    expect(error).toBeNull();
    expect(data).toEqual([{ id: EXPERT_PUBLIC, bio }]);
  });

  it('черновик пишет свои области экспертизы, гость и чужой эксперт — нет', async () => {
    const { data: economics } = await draftExpert
      .from('expertise')
      .select('id')
      .eq('slug', 'economics')
      .single();

    if (!economics) {
      throw new Error('В справочнике нет economics');
    }

    const { error: writeError } = await draftExpert.from('expert_expertise').upsert({
      expert_id: EXPERT_DRAFT,
      expertise_id: economics.id,
    });

    expect(writeError).toBeNull();

    const { data: own } = await draftExpert
      .from('expert_expertise')
      .select('expertise_id')
      .eq('expert_id', EXPERT_DRAFT);

    expect(own).toEqual([{ expertise_id: economics.id }]);

    const guestWrite = await anon().from('expert_expertise').insert({
      expert_id: EXPERT_DRAFT,
      expertise_id: economics.id,
    });

    expect(guestWrite.error).not.toBeNull();

    // .select() обязателен: без него PostgREST не возвращает строки, и проверка
    // «ничего не записано» прошла бы даже при успешной вставке.
    const strangerWrite = await otherExpert
      .from('expert_expertise')
      .insert({ expert_id: EXPERT_DRAFT, expertise_id: economics.id })
      .select('expertise_id');

    expect(strangerWrite.data ?? []).toEqual([]);
  });
});

/**
 * Инвариант «опубликован ⇒ есть область и язык» на настоящей базе.
 *
 * tests/profile-write-plan.test.ts проверяет порядок на модели, а здесь тот же план
 * исполняется теми же запросами PostgREST, что и в форме, и после каждого шага
 * состояние читается из базы. Модель не знает про RLS, внешние ключи и ключ конфликта
 * upsert — тут они участвуют.
 *
 * Сбой посреди сохранения не эмулируется: остановка на любом шаге — это и есть чтение
 * состояния после него, потому что следующего запроса могло не случиться.
 */
describe('порядок записи на живой базе', () => {
  async function relations(client: SupabaseClient<Database>, expertId: string) {
    const [{ data: expert }, { data: expertise }, { data: languages }] = await Promise.all([
      client.rpc('my_expert_profile'),
      client.from('expert_expertise').select('expertise_id').eq('expert_id', expertId),
      client.from('expert_languages').select('language_id').eq('expert_id', expertId),
    ]);

    return {
      publishedAt: expert?.[0]?.published_at ?? null,
      expertiseIds: (expertise ?? []).map((row) => row.expertise_id).sort((a, b) => a - b),
      languageIds: (languages ?? []).map((row) => row.language_id).sort((a, b) => a - b),
    };
  }

  /**
   * Приводит профиль к состоянию «опубликован с ровно этими связями».
   *
   * Тест правит общие таблицы, поэтому не полагается на то, что осталось от сида или
   * от предыдущего прогона: иначе второй запуск проверял бы уже другой переход, а
   * падение посередине портило бы все последующие. Публикация снимается до правки
   * связей и ставится после — тем же порядком, что и в самой форме, чтобы даже
   * подготовка не оставляла в базе опубликованный профиль без связей.
   */
  async function arrangePublished(expertiseIds: number[], languageIds: number[]): Promise<string> {
    const publishedAt = new Date('2026-01-01T00:00:00.000Z').toISOString();

    await expert.from('experts').update({ published_at: null }).eq('id', EXPERT_PUBLIC);

    await expert
      .from('expert_expertise')
      .upsert(expertiseIds.map((id) => ({ expert_id: EXPERT_PUBLIC, expertise_id: id })));
    await expert.from('expert_languages').upsert(
      languageIds.map((id) => ({ expert_id: EXPERT_PUBLIC, language_id: id, proficiency: 'b1' })),
      { onConflict: 'expert_id,language_id' },
    );

    await expert
      .from('expert_expertise')
      .delete()
      .eq('expert_id', EXPERT_PUBLIC)
      .not('expertise_id', 'in', `(${expertiseIds.join(',')})`);
    await expert
      .from('expert_languages')
      .delete()
      .eq('expert_id', EXPERT_PUBLIC)
      .not('language_id', 'in', `(${languageIds.join(',')})`);

    const { error } = await expert
      .from('experts')
      .update({ published_at: publishedAt })
      .eq('id', EXPERT_PUBLIC);

    if (error) throw new Error(`Не удалось подготовить профиль: ${error.message}`);

    return publishedAt;
  }

  it('опубликованный профиль ни на одном шаге полной замены не остаётся без связей', async () => {
    const [{ data: expertise }, { data: languages }] = await Promise.all([
      expert.from('expertise').select('id').order('id').limit(4),
      expert.from('languages').select('id').order('id').limit(4),
    ]);

    if (!expertise || expertise.length < 4 || !languages || languages.length < 4) {
      throw new Error('В справочниках слишком мало строк для полной замены');
    }

    // Два непересекающихся набора: только полная замена открывает окно, в котором
    // порядок «сначала удалить» оставлял опубликованный профиль пустым.
    const fromExpertise = expertise.slice(0, 2).map((row) => row.id);
    const nextExpertise = expertise.slice(2, 4).map((row) => row.id);
    const fromLanguages = languages.slice(0, 2).map((row) => row.id);
    const nextLanguages = languages.slice(2, 4).map((row) => row.id);

    await arrangePublished(fromExpertise, fromLanguages);

    const before = await relations(expert, EXPERT_PUBLIC);

    expect(before.publishedAt).not.toBeNull();
    expect(before.expertiseIds).toEqual([...fromExpertise].sort((a, b) => a - b));
    expect(before.languageIds).toEqual([...fromLanguages].sort((a, b) => a - b));

    const columns: ProfileColumns = { first_name: 'Yves', last_name: 'Habimana' };
    const plan = planProfileWrite(
      before,
      {
        published: true,
        expertiseIds: nextExpertise,
        languages: nextLanguages.map((languageId) => ({ languageId, proficiency: 'b2' as const })),
      },
      new Date().toISOString(),
    );

    for (const [index, step] of plan.entries()) {
      const error = await runProfileWriteStep(expert, EXPERT_PUBLIC, columns, step);

      expect(error, `шаг ${index + 1} (${step.kind}) не прошёл`).toBeNull();

      const state = await relations(expert, EXPERT_PUBLIC);
      const intact =
        state.publishedAt === null ||
        (state.expertiseIds.length > 0 && state.languageIds.length > 0);

      expect(
        intact,
        `после шага ${index + 1}/${plan.length} (${step.kind}): опубликован=${
          state.publishedAt !== null
        }, области=[${state.expertiseIds}], языки=[${state.languageIds}]`,
      ).toBe(true);
    }

    const after = await relations(expert, EXPERT_PUBLIC);

    // Публикация не снималась: профиль был опубликован и остался, лишнего запроса нет.
    expect(after.publishedAt).toBe(before.publishedAt);
    expect(after.expertiseIds).toEqual([...nextExpertise].sort((a, b) => a - b));
    expect(after.languageIds).toEqual([...nextLanguages].sort((a, b) => a - b));
  });
});
