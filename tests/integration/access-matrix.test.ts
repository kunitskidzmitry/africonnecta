import type { SupabaseClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { anon, DATABASE_URL, SEED_PASSWORD } from './local-stack';

/**
 * Матрица доступа (WP4). Соответствует §8.1 docs/implementation-prompt.md.
 *
 * По тесту на каждую пару «роль — действие», как требует §12. Это не формальность:
 * именно здесь живут IDOR-уязвимости, и найти их иначе, чем перебором ролей, нельзя —
 * код выглядит правильным в обоих случаях, разница видна только в результате запроса.
 *
 * Каждый актёр входит настоящим паролем и работает публичным ключом. Служебный ключ,
 * обходящий RLS, не используется: тест обязан видеть систему теми же глазами, что и
 * посетитель, иначе он проверяет не то, что защищает продакшен.
 *
 * Данные берутся из supabase/seed.sql с фиксированными идентификаторами.
 * Запуск: `npm run db:reset && npm run test:integration`.
 */

/** Идентификаторы из сида. */
const EXPERT_PUBLIC = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const EXPERT_HIDDEN = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const EXPERT_DRAFT = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const INSTITUTION_VERIFIED = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INSTITUTION_UNVERIFIED = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const USER_EXPERT = '11111111-1111-1111-1111-111111111111';
const USER_INSTITUTION = '22222222-2222-2222-2222-222222222222';

const ACTORS = {
  expert: 'expert@example.test',
  hiddenExpert: 'expert.hidden@example.test',
  draftExpert: 'expert.draft@example.test',
  institution: 'institution@example.test',
  unverifiedInstitution: 'unverified@example.test',
  admin: 'admin@example.test',
  suspended: 'suspended@example.test',
} as const;

type ActorName = keyof typeof ACTORS;

const clients = new Map<ActorName, SupabaseClient>();
const db = new Client({ connectionString: DATABASE_URL });

/** Клиент без сессии — так систему видит случайный посетитель. */
const guest = anon;

function as(actor: ActorName): SupabaseClient {
  const client = clients.get(actor);
  if (!client) throw new Error(`Актёр ${actor} не вошёл в систему`);
  return client;
}

beforeAll(async () => {
  await db.connect();

  for (const [name, email] of Object.entries(ACTORS) as [ActorName, string][]) {
    const client = guest();
    const { error } = await client.auth.signInWithPassword({ email, password: SEED_PASSWORD });

    if (error) throw new Error(`Не удалось войти как ${name} (${email}): ${error.message}`);

    clients.set(name, client);
  }
});

afterAll(async () => {
  await db.end();
});

// ---------------------------------------------------------------------------

describe('чтение профиля эксперта', () => {
  const visibleTo: [string, () => SupabaseClient][] = [
    ['гость', guest],
    ['эксперт (свой профиль)', () => as('expert')],
    ['эксперт (чужой профиль)', () => as('hiddenExpert')],
    ['представитель институции', () => as('institution')],
    ['администратор', () => as('admin')],
  ];

  it.each(visibleTo)('опубликованный публичный профиль виден: %s', async (_name, client) => {
    const { data } = await client()
      .from('experts')
      .select('id, first_name')
      .eq('id', EXPERT_PUBLIC);

    expect(data).toEqual([{ id: EXPERT_PUBLIC, first_name: 'Yves' }]);
  });

  const hiddenFrom: [string, () => SupabaseClient][] = [
    ['гость', guest],
    ['посторонний эксперт', () => as('expert')],
    ['представитель институции', () => as('institution')],
  ];

  it.each(hiddenFrom)('скрытый профиль не виден: %s', async (_name, client) => {
    const { data } = await client().from('experts').select('id').eq('id', EXPERT_HIDDEN);

    expect(data).toEqual([]);
  });

  it('скрытый профиль виден своему владельцу', async () => {
    const { data } = await as('hiddenExpert').from('experts').select('id').eq('id', EXPERT_HIDDEN);

    expect(data).toEqual([{ id: EXPERT_HIDDEN }]);
  });

  it('скрытый профиль виден администратору', async () => {
    const { data } = await as('admin').from('experts').select('id').eq('id', EXPERT_HIDDEN);

    expect(data).toEqual([{ id: EXPERT_HIDDEN }]);
  });

  it.each(hiddenFrom)('неопубликованный черновик не виден: %s', async (_name, client) => {
    const { data } = await client().from('experts').select('id').eq('id', EXPERT_DRAFT);

    expect(data).toEqual([]);
  });

  it('черновик виден своему владельцу', async () => {
    const { data } = await as('draftExpert').from('experts').select('id').eq('id', EXPERT_DRAFT);

    expect(data).toEqual([{ id: EXPERT_DRAFT }]);
  });

  it('заблокированный пользователь не видит профили с видимостью для вошедших', async () => {
    // У заблокированного сессия действительна до истечения токена, но роли нет,
    // поэтому он приравнен к гостю.
    const { data } = await as('suspended').from('experts').select('id').eq('id', EXPERT_HIDDEN);

    expect(data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('контакты эксперта: прямой доступ к колонкам', () => {
  const everyone: [string, () => SupabaseClient][] = [
    ['гость', guest],
    ['эксперт', () => as('expert')],
    ['представитель институции', () => as('institution')],
    ['администратор', () => as('admin')],
  ];

  // Главная защита ценности продукта. RLS построчная и от этого запроса не спасает —
  // права сняты на уровне колонок, поэтому запрос не выполняется ни у кого.
  it.each(everyone)('телефон нельзя запросить напрямую: %s', async (_name, client) => {
    const { data, error } = await client().from('experts').select('id, phone');

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it.each(everyone)('select(*) закрыт, колонки перечисляются явно: %s', async (_name, client) => {
    const { error } = await client().from('experts').select('*');

    expect(error).not.toBeNull();
  });

  it('контактная почта институции тоже закрыта', async () => {
    const { error } = await as('institution').from('institutions').select('id, contact_email');

    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('контакты эксперта: раскрытие через функцию', () => {
  it('гость не получает контакты', async () => {
    const { error } = await guest().rpc('reveal_expert_contacts', {
      target_expert_id: EXPERT_PUBLIC,
    });

    expect(error).not.toBeNull();
  });

  it('эксперт получает собственные контакты', async () => {
    const { data, error } = await as('expert').rpc('reveal_expert_contacts', {
      target_expert_id: EXPERT_PUBLIC,
    });

    expect(error).toBeNull();
    expect(data).toEqual([{ email: ACTORS.expert, phone: '+250788123456', cv_file_id: null }]);
  });

  // Строка матрицы «Expert (чужой) — контакты: ❌». Иначе достаточно зарегистрироваться
  // экспертом, чтобы выгрузить базу.
  it('эксперт не получает контакты другого эксперта', async () => {
    const { error } = await as('hiddenExpert').rpc('reveal_expert_contacts', {
      target_expert_id: EXPERT_PUBLIC,
    });

    expect(error?.code).toBe('42501');
  });

  it('институция без верификации получает отказ с понятной причиной', async () => {
    const { error } = await as('unverifiedInstitution').rpc('reveal_expert_contacts', {
      target_expert_id: EXPERT_PUBLIC,
    });

    expect(error?.code).toBe('AF002');
  });

  it('заблокированный пользователь получает отказ', async () => {
    const { error } = await as('suspended').rpc('reveal_expert_contacts', {
      target_expert_id: EXPERT_PUBLIC,
    });

    expect(error).not.toBeNull();
  });

  it('скрытый профиль не раскрывается даже верифицированной институции', async () => {
    const { error } = await as('institution').rpc('reveal_expert_contacts', {
      target_expert_id: EXPERT_HIDDEN,
    });

    expect(error?.code).toBe('42501');
  });

  it('верифицированная институция получает контакты и оставляет след в журнале', async () => {
    await db.query('delete from public.contact_disclosures where institution_id = $1', [
      INSTITUTION_VERIFIED,
    ]);
    await db.query("delete from public.audit_log where action = 'expert.contacts.reveal'");

    const { data, error } = await as('institution').rpc('reveal_expert_contacts', {
      target_expert_id: EXPERT_PUBLIC,
    });

    expect(error).toBeNull();
    expect(data).toEqual([{ email: ACTORS.expert, phone: '+250788123456', cv_file_id: null }]);

    const { rows: disclosures } = await db.query(
      'select expert_id from public.contact_disclosures where institution_id = $1',
      [INSTITUTION_VERIFIED],
    );
    expect(disclosures).toEqual([{ expert_id: EXPERT_PUBLIC }]);

    const { rows: audit } = await db.query(
      "select action, entity_id from public.audit_log where action = 'expert.contacts.reveal'",
    );
    expect(audit).toEqual([{ action: 'expert.contacts.reveal', entity_id: EXPERT_PUBLIC }]);
  });

  it('квота ограничивает новых экспертов, но не повторный просмотр', async () => {
    await db.query('delete from public.contact_disclosures where institution_id = $1', [
      INSTITUTION_VERIFIED,
    ]);
    // В сиде мало публичных профилей, поэтому лимит временно сужаем до 1.
    await db.query(
      "update public.plan_limits set contact_disclosures_per_day = 1 where plan = 'free'",
    );

    try {
      const first = await as('institution').rpc('reveal_expert_contacts', {
        target_expert_id: EXPERT_PUBLIC,
      });
      expect(first.error).toBeNull();

      const repeat = await as('institution').rpc('reveal_expert_contacts', {
        target_expert_id: EXPERT_PUBLIC,
      });
      expect(repeat.error).toBeNull();

      // Черновик сам по себе не раскрывается; на время проверки квоты публикуем его.
      await db.query(
        `update public.experts
         set published_at = now(), profile_visibility = 'public'
         where id = $1`,
        [EXPERT_DRAFT],
      );
      const overQuota = await as('institution').rpc('reveal_expert_contacts', {
        target_expert_id: EXPERT_DRAFT,
      });
      expect(overQuota.error?.code).toBe('AF001');
    } finally {
      await db.query(
        "update public.plan_limits set contact_disclosures_per_day = 5 where plan = 'free'",
      );
      await db.query(
        `update public.experts
         set published_at = null, profile_visibility = 'public'
         where id = $1`,
        [EXPERT_DRAFT],
      );
      await db.query('delete from public.contact_disclosures where institution_id = $1', [
        INSTITUTION_VERIFIED,
      ]);
    }
  });

  /**
   * Квота не обходится параллельными запросами.
   *
   * Проверка квоты — это чтение счётчика, сравнение с лимитом и вставка тремя отдельными
   * действиями. На уровне READ COMMITTED вторая транзакция не видит незафиксированную
   * вставку первой, поэтому без блокировки обе читают одно и то же «израсходовано 0»
   * и обе проходят. Скрипт с N одновременными запросами получал примерно N-кратную
   * квоту, а квота — единственное, что ограничивает скорость съёма базы (§7).
   *
   * Права при этом не нарушаются: институция верифицирована, профили опубликованы.
   * Поэтому дыру не видно ни в одной проверке матрицы доступа — только здесь.
   *
   * Две отдельные транзакции, а не Promise.all по RPC: параллельность нужна
   * гарантированная. Здесь моменты фиксации задаёт тест, и результат не зависит
   * от того, как PostgREST разложил запросы по соединениям.
   */
  it('квота не обходится одновременными запросами', async () => {
    const claims = `{"sub":"${USER_INSTITUTION}","role":"authenticated"}`;
    const first = new Client({ connectionString: DATABASE_URL });
    const second = new Client({ connectionString: DATABASE_URL });

    await Promise.all([first.connect(), second.connect()]);

    await db.query('delete from public.contact_disclosures where institution_id = $1', [
      INSTITUTION_VERIFIED,
    ]);
    await db.query(
      "update public.plan_limits set contact_disclosures_per_day = 1 where plan = 'free'",
    );
    await db.query(
      `update public.experts
         set published_at = now(), profile_visibility = 'public'
       where id = $1`,
      [EXPERT_DRAFT],
    );

    try {
      for (const client of [first, second]) {
        await client.query('begin');
        await client.query(`set local request.jwt.claims = '${claims}'`);
      }

      const firstReveal = await first.query('select * from public.reveal_expert_contacts($1)', [
        EXPERT_PUBLIC,
      ]);

      expect(firstReveal.rows).toHaveLength(1);

      // Вторая транзакция входит, пока первая держит незафиксированную вставку.
      const secondReveal = second.query('select * from public.reveal_expert_contacts($1)', [
        EXPERT_DRAFT,
      ]);
      let secondFinished = false;
      void secondReveal.then(
        () => (secondFinished = true),
        () => (secondFinished = true),
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Ждёт блокировку, а не отвечает: без неё она уже успела бы выдать контакты.
      expect(secondFinished, 'вторая транзакция прошла, не дождавшись первой').toBe(false);

      await first.query('commit');

      await expect(secondReveal).rejects.toMatchObject({ code: 'AF001' });

      const { rows } = await db.query(
        'select count(*)::int as used from public.contact_disclosures where institution_id = $1',
        [INSTITUTION_VERIFIED],
      );

      expect(rows[0].used).toBe(1);
    } finally {
      await second.query('rollback').catch(() => {});
      await first.query('rollback').catch(() => {});
      await Promise.all([first.end(), second.end()]);

      await db.query(
        "update public.plan_limits set contact_disclosures_per_day = 5 where plan = 'free'",
      );
      await db.query('update public.experts set published_at = null where id = $1', [EXPERT_DRAFT]);
      await db.query('delete from public.contact_disclosures where institution_id = $1', [
        INSTITUTION_VERIFIED,
      ]);
      await db.query("delete from public.audit_log where action = 'expert.contacts.reveal'");
    }
  });
});

// ---------------------------------------------------------------------------

describe('правка профиля эксперта', () => {
  it('владелец правит свой профиль', async () => {
    const bio = `Обновлено в тесте ${Date.now()}`;

    const { data, error } = await as('expert')
      .from('experts')
      .update({ bio })
      .eq('id', EXPERT_PUBLIC)
      .select('id, bio');

    expect(error).toBeNull();
    expect(data).toEqual([{ id: EXPERT_PUBLIC, bio }]);
  });

  const cannotEdit: [string, ActorName][] = [
    ['посторонний эксперт', 'hiddenExpert'],
    ['представитель институции', 'institution'],
    // Правки администратора по матрице требуют записи в журнал, то есть отдельной
    // функции. Пока её нет, прямая запись закрыта — отказ по умолчанию (§8.2).
    ['администратор', 'admin'],
  ];

  it.each(cannotEdit)('чужой профиль не правит: %s', async (_name, actor) => {
    const { data } = await as(actor)
      .from('experts')
      .update({ bio: 'взлом' })
      .eq('id', EXPERT_PUBLIC)
      .select('id');

    expect(data).toEqual([]);
  });

  it('гость не правит ничего', async () => {
    const { data, error } = await guest()
      .from('experts')
      .update({ bio: 'взлом' })
      .eq('id', EXPERT_PUBLIC)
      .select('id');

    // Без сессии PostgREST отвечает ошибкой и data=null, а не пустым массивом.
    expect(error).not.toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it('заблокированный пользователь не правит свой профиль', async () => {
    const { data } = await as('suspended')
      .from('experts')
      .update({ bio: 'взлом' })
      .eq('id', EXPERT_PUBLIC)
      .select('id');

    expect(data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('учётные записи', () => {
  it('гость не видит ни одной', async () => {
    const { data } = await guest().from('users').select('id');
    expect(data).toEqual([]);
  });

  it('пользователь видит только свою', async () => {
    const { data } = await as('expert').from('users').select('id');
    expect(data).toEqual([{ id: USER_EXPERT }]);
  });

  it('администратор видит все', async () => {
    const { data } = await as('admin').from('users').select('id');
    expect(data?.length).toBeGreaterThan(1);
  });

  it('пользователь меняет свой язык интерфейса', async () => {
    const { error } = await as('expert')
      .from('users')
      .update({ locale: 'en' })
      .eq('id', USER_EXPERT);

    expect(error).toBeNull();
  });

  // Повышение прав через прямую запись роли — первое, что попробует злоумышленник.
  it('пользователь не может выдать себе роль администратора', async () => {
    const { error } = await as('expert')
      .from('users')
      .update({ role: 'admin' })
      .eq('id', USER_EXPERT);

    expect(error).not.toBeNull();

    const { rows } = await db.query('select role::text from public.users where id = $1', [
      USER_EXPERT,
    ]);
    expect(rows[0]).toEqual({ role: 'expert' });
  });

  it('пользователь не может снять с себя блокировку', async () => {
    const { error } = await as('suspended')
      .from('users')
      .update({ status: 'active' })
      .eq('id', USER_EXPERT);

    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('институции', () => {
  it('гость видит институцию, но без контактов', async () => {
    const { data, error } = await guest()
      .from('institutions')
      .select('id, name, verified_at')
      .eq('id', INSTITUTION_VERIFIED);

    expect(error).toBeNull();
    expect(data?.[0]?.name).toBe('University of Rwanda');
  });

  it('владелец правит свою институцию', async () => {
    const { error } = await as('institution')
      .from('institutions')
      .update({ website: 'https://ur.ac.rw' })
      .eq('id', INSTITUTION_VERIFIED);

    expect(error).toBeNull();
  });

  it('чужую институцию не правит никто', async () => {
    const { data } = await as('unverifiedInstitution')
      .from('institutions')
      .update({ name: 'Захвачено' })
      .eq('id', INSTITUTION_VERIFIED)
      .select('id');

    expect(data).toEqual([]);
  });

  // Верификация — решение платформы, а не самой организации.
  it('институция не может верифицировать себя сама', async () => {
    const { error } = await as('unverifiedInstitution')
      .from('institutions')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', INSTITUTION_UNVERIFIED);

    expect(error).not.toBeNull();

    const { rows } = await db.query('select verified_at from public.institutions where id = $1', [
      INSTITUTION_UNVERIFIED,
    ]);
    expect(rows[0]).toEqual({ verified_at: null });
  });

  it('институция не может повысить себе тариф', async () => {
    const { error } = await as('institution')
      .from('institutions')
      .update({ plan: 'premium' })
      .eq('id', INSTITUTION_VERIFIED);

    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('состав институции', () => {
  it('участник видит своё членство', async () => {
    const { data } = await as('institution').from('institution_members').select('institution_id');

    expect(data).toEqual([{ institution_id: INSTITUTION_VERIFIED }]);
  });

  it('участник чужой институции его не видит', async () => {
    const { data } = await as('unverifiedInstitution')
      .from('institution_members')
      .select('institution_id')
      .eq('institution_id', INSTITUTION_VERIFIED);

    expect(data).toEqual([]);
  });

  it('гость не видит состав', async () => {
    const { data } = await guest().from('institution_members').select('institution_id');
    expect(data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('журнал действий', () => {
  const noAccess: [string, () => SupabaseClient][] = [
    ['гость', guest],
    ['эксперт', () => as('expert')],
    ['представитель институции', () => as('institution')],
  ];

  it.each(noAccess)('журнал закрыт: %s', async (_name, client) => {
    const { data } = await client().from('audit_log').select('id');
    expect(data).toEqual([]);
  });

  it('администратор читает журнал', async () => {
    await as('admin').rpc('reveal_expert_contacts', { target_expert_id: EXPERT_PUBLIC });

    const { data, error } = await as('admin').from('audit_log').select('action');

    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
  });

  it('запись в журнал напрямую невозможна', async () => {
    const { error } = await as('admin')
      .from('audit_log')
      .insert({ action: 'подделка', entity_type: 'expert' });

    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('справочники', () => {
  it('гость читает страны: они нужны на форме регистрации', async () => {
    const { data } = await guest().from('countries').select('iso2');
    expect(data?.length).toBeGreaterThan(0);
  });

  it('гость не может дописать страну', async () => {
    const { error } = await guest().from('countries').insert({ iso2: 'XX', name: 'Выдумка' });
    expect(error).not.toBeNull();
  });

  it('эксперт не может дописать область экспертизы', async () => {
    // Свободный ввод таксономии запрещён: иначе фасетный поиск развалится (§4.3).
    const { error } = await as('expert').from('expertise').insert({ slug: 'ai', label: 'AI' });
    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Opportunity Board (M3). Строка матрицы §8.1 «Создать вакансию» + IDOR заявок.
// ---------------------------------------------------------------------------

const OPPORTUNITY_PUBLISHED = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const OPPORTUNITY_DRAFT = 'f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0';

describe('вакансии', () => {
  const seePublished: [string, () => SupabaseClient][] = [
    ['гость', guest],
    ['эксперт', () => as('expert')],
    ['представитель институции', () => as('institution')],
    ['администратор', () => as('admin')],
  ];

  it.each(seePublished)('опубликованная вакансия видна: %s', async (_name, client) => {
    const { data } = await client()
      .from('opportunities')
      .select('id, title')
      .eq('id', OPPORTUNITY_PUBLISHED);

    expect(data).toEqual([
      {
        id: OPPORTUNITY_PUBLISHED,
        title: 'Guest Lecturer in Artificial Intelligence',
      },
    ]);
  });

  const cannotSeeDraft: [string, () => SupabaseClient][] = [
    ['гость', guest],
    ['эксперт', () => as('expert')],
    ['чужая институция', () => as('unverifiedInstitution')],
  ];

  it.each(cannotSeeDraft)('черновик чужой институции не виден: %s', async (_name, client) => {
    const { data } = await client().from('opportunities').select('id').eq('id', OPPORTUNITY_DRAFT);

    expect(data).toEqual([]);
  });

  it('черновик виден своей институции', async () => {
    const { data } = await as('institution')
      .from('opportunities')
      .select('id')
      .eq('id', OPPORTUNITY_DRAFT);

    expect(data).toEqual([{ id: OPPORTUNITY_DRAFT }]);
  });

  it('член институции создаёт вакансию', async () => {
    const { data, error } = await as('institution')
      .from('opportunities')
      .insert({
        institution_id: INSTITUTION_VERIFIED,
        created_by: USER_INSTITUTION,
        title: 'Thesis Supervisors — Public Health',
        description: 'Seeking supervisors for MSc theses in public health.',
        type: 'supervision',
        mode: 'online',
        status: 'draft',
      })
      .select('id, status')
      .single();

    expect(error).toBeNull();
    expect(data?.status).toBe('draft');

    await as('institution').from('opportunities').delete().eq('id', data!.id);
  });

  const cannotCreate: [string, ActorName | null][] = [
    ['гость', null],
    ['эксперт', 'expert'],
  ];

  it.each(cannotCreate)('вакансию не создаёт: %s', async (_name, actor) => {
    const client = actor ? as(actor) : guest();
    const { data, error } = await client
      .from('opportunities')
      .insert({
        institution_id: INSTITUTION_VERIFIED,
        created_by: actor === 'expert' ? USER_EXPERT : USER_INSTITUTION,
        title: 'Forbidden vacancy',
        description: 'Should be rejected by RLS.',
        type: 'research',
        mode: 'online',
        status: 'draft',
      })
      .select('id');

    expect(error).not.toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it('член институции публикует черновик', async () => {
    const { data: created } = await as('institution')
      .from('opportunities')
      .insert({
        institution_id: INSTITUTION_VERIFIED,
        created_by: USER_INSTITUTION,
        title: 'Research Collaboration on Climate Adaptation',
        description: 'Joint research proposal for climate adaptation in the Great Lakes.',
        type: 'research',
        mode: 'hybrid',
        status: 'draft',
      })
      .select('id')
      .single();

    const { data, error } = await as('institution')
      .from('opportunities')
      .update({ status: 'published' })
      .eq('id', created!.id)
      .select('status, published_at')
      .single();

    expect(error).toBeNull();
    expect(data?.status).toBe('published');
    expect(data?.published_at).not.toBeNull();

    // Опубликованную вакансию член не удаляет (только draft) — чистим через SQL.
    await db.query('delete from public.opportunities where id = $1', [created!.id]);
  });
});

describe('заявки на вакансии', () => {
  it('эксперт подаёт заявку на опубликованную вакансию', async () => {
    const { data, error } = await as('expert')
      .from('applications')
      .insert({
        opportunity_id: OPPORTUNITY_PUBLISHED,
        expert_id: EXPERT_PUBLIC,
        cover_letter: 'I teach related topics at the University of Rwanda.',
      })
      .select('id, status')
      .single();

    expect(error).toBeNull();
    expect(data?.status).toBe('submitted');

    await db.query('delete from public.applications where id = $1', [data!.id]);
  });

  it('эксперт не подаёт заявку от чужого профиля', async () => {
    const { data, error } = await as('hiddenExpert')
      .from('applications')
      .insert({
        opportunity_id: OPPORTUNITY_PUBLISHED,
        expert_id: EXPERT_PUBLIC,
        cover_letter: 'IDOR attempt',
      })
      .select('id');

    expect(error).not.toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it('гость не подаёт заявку', async () => {
    const { data, error } = await guest()
      .from('applications')
      .insert({
        opportunity_id: OPPORTUNITY_PUBLISHED,
        expert_id: EXPERT_PUBLIC,
      })
      .select('id');

    expect(error).not.toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it('институция принимает заявку и появляется engagement', async () => {
    const { data: application } = await as('expert')
      .from('applications')
      .insert({
        opportunity_id: OPPORTUNITY_PUBLISHED,
        expert_id: EXPERT_PUBLIC,
        cover_letter: 'Ready to collaborate.',
      })
      .select('id')
      .single();

    const { error } = await as('institution')
      .from('applications')
      .update({ status: 'accepted' })
      .eq('id', application!.id);

    expect(error).toBeNull();

    const { data: engagement } = await as('institution')
      .from('engagements')
      .select('source_type, source_id, expert_id')
      .eq('source_id', application!.id)
      .single();

    expect(engagement).toEqual({
      source_type: 'application',
      source_id: application!.id,
      expert_id: EXPERT_PUBLIC,
    });

    // Чужой эксперт не читает чужой engagement (IDOR).
    const { data: leaked } = await as('hiddenExpert')
      .from('engagements')
      .select('id')
      .eq('source_id', application!.id);

    expect(leaked).toEqual([]);

    await db.query('delete from public.engagements where source_id = $1', [application!.id]);
    await db.query('delete from public.applications where id = $1', [application!.id]);
  });

  it('институция не меняет заявку на чужой вакансии', async () => {
    const { data: application, error: applyError } = await as('expert')
      .from('applications')
      .insert({
        opportunity_id: OPPORTUNITY_PUBLISHED,
        expert_id: EXPERT_PUBLIC,
      })
      .select('id')
      .single();

    expect(applyError).toBeNull();
    expect(application).not.toBeNull();

    const { data } = await as('unverifiedInstitution')
      .from('applications')
      .update({ status: 'rejected' })
      .eq('id', application!.id)
      .select('id');

    expect(data).toEqual([]);

    await db.query('delete from public.applications where id = $1', [application!.id]);
  });
});

describe('приглашения', () => {
  it('институция приглашает эксперта; эксперт принимает → engagement', async () => {
    const { data: invitation, error: inviteError } = await as('institution')
      .from('invitations')
      .insert({
        institution_id: INSTITUTION_VERIFIED,
        expert_id: EXPERT_PUBLIC,
        opportunity_id: OPPORTUNITY_PUBLISHED,
        message: 'We would like you to join this lectureship.',
      })
      .select('id')
      .single();

    expect(inviteError).toBeNull();

    const { error: acceptError } = await as('expert')
      .from('invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation!.id);

    expect(acceptError).toBeNull();

    const { data: engagement } = await as('expert')
      .from('engagements')
      .select('source_type, institution_id')
      .eq('source_id', invitation!.id)
      .single();

    expect(engagement).toEqual({
      source_type: 'invitation',
      institution_id: INSTITUTION_VERIFIED,
    });

    await db.query('delete from public.engagements where source_id = $1', [invitation!.id]);
    await db.query('delete from public.invitations where id = $1', [invitation!.id]);
  });

  it('эксперт не создаёт приглашение', async () => {
    const { data, error } = await as('expert')
      .from('invitations')
      .insert({
        institution_id: INSTITUTION_VERIFIED,
        expert_id: EXPERT_PUBLIC,
        message: 'self-invite',
      })
      .select('id');

    expect(error).not.toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it('клиент не пишет engagement напрямую', async () => {
    const { error } = await as('institution').from('engagements').insert({
      expert_id: EXPERT_PUBLIC,
      institution_id: INSTITUTION_VERIFIED,
      source_type: 'invitation',
      source_id: '99999999-9999-9999-9999-999999999999',
    });

    expect(error).not.toBeNull();
  });
});

describe('переписка и уведомления', () => {
  afterEach(async () => {
    await db.query(
      `delete from public.conversations
       where institution_id = $1 and expert_id = $2`,
      [INSTITUTION_VERIFIED, EXPERT_PUBLIC],
    );
    await db.query(
      `delete from public.conversations
       where institution_id = $1 and expert_id = $2`,
      [INSTITUTION_VERIFIED, EXPERT_DRAFT],
    );
    await db.query('delete from public.notifications where user_id = any($1::uuid[])', [
      [USER_EXPERT, USER_INSTITUTION],
    ]);
  });

  it('гость не читает разговоры и не стартует переписку', async () => {
    const { data } = await guest().from('conversations').select('id');
    expect(data).toEqual([]);

    const { error } = await guest().rpc('start_conversation', {
      target_expert_id: EXPERT_PUBLIC,
      initial_body: 'Hello from the street',
    });
    expect(error).not.toBeNull();
  });

  it('клиент не вставляет сообщения напрямую', async () => {
    const { error } = await as('institution').from('messages').insert({
      conversation_id: '99999999-9999-9999-9999-999999999999',
      sender_user_id: USER_INSTITUTION,
      body: 'direct insert',
    });
    expect(error).not.toBeNull();
  });

  it('верифицированная институция открывает разговор; эксперт видит, админ — нет', async () => {
    const { data: conversationId, error } = await as('institution').rpc('start_conversation', {
      target_expert_id: EXPERT_PUBLIC,
      initial_body: 'We would like to discuss a guest lecture.',
    });

    expect(error).toBeNull();
    expect(conversationId).toEqual(expect.any(String));

    const { data: forExpert } = await as('expert')
      .from('messages')
      .select('body')
      .eq('conversation_id', conversationId!);
    expect(forExpert).toEqual([{ body: 'We would like to discuss a guest lecture.' }]);

    const { data: forAdmin } = await as('admin')
      .from('conversations')
      .select('id')
      .eq('id', conversationId!);
    expect(forAdmin).toEqual([]);

    const { data: notifications } = await as('expert')
      .from('notifications')
      .select('type')
      .eq('type', 'message_received');
    expect(notifications?.length).toBeGreaterThan(0);
  });

  it('после жалобы админ читает разговор', async () => {
    const { data: conversationId } = await as('institution').rpc('start_conversation', {
      target_expert_id: EXPERT_PUBLIC,
      initial_body: 'Please review this collaboration idea.',
    });

    const { error: reportError } = await as('expert').rpc('report_conversation', {
      target_conversation_id: conversationId!,
      reason: 'Suspicious outreach',
    });
    expect(reportError).toBeNull();

    const { data: forAdmin } = await as('admin')
      .from('conversations')
      .select('id, reported_at')
      .eq('id', conversationId!);
    expect(forAdmin).toEqual([{ id: conversationId, reported_at: expect.any(String) }]);
  });

  it('неверифицированная институция не открывает первый контакт', async () => {
    const { error } = await as('unverifiedInstitution').rpc('start_conversation', {
      target_expert_id: EXPERT_PUBLIC,
      initial_body: 'Should be blocked',
    });
    expect(error?.code).toBe('AF002');
  });

  it('квота first_contact ограничивает новые пары, но не повтор в том же разговоре', async () => {
    await db.query("update public.plan_limits set first_contacts_per_day = 1 where plan = 'free'");

    try {
      const first = await as('institution').rpc('start_conversation', {
        target_expert_id: EXPERT_PUBLIC,
        initial_body: 'First allowed contact',
      });
      expect(first.error).toBeNull();

      const repeat = await as('institution').rpc('start_conversation', {
        target_expert_id: EXPERT_PUBLIC,
        initial_body: 'Follow-up in the same thread',
      });
      expect(repeat.error).toBeNull();

      await db.query(
        `update public.experts
         set published_at = now(), profile_visibility = 'public'
         where id = $1`,
        [EXPERT_DRAFT],
      );

      const overQuota = await as('institution').rpc('start_conversation', {
        target_expert_id: EXPERT_DRAFT,
        initial_body: 'Second new expert — should hit quota',
      });
      expect(overQuota.error?.code).toBe('AF003');
    } finally {
      await db.query(
        "update public.plan_limits set first_contacts_per_day = 5 where plan = 'free'",
      );
      await db.query(
        `update public.experts
         set published_at = null, profile_visibility = 'public'
         where id = $1`,
        [EXPERT_DRAFT],
      );
      await db.query('delete from public.first_contacts where institution_id = $1', [
        INSTITUTION_VERIFIED,
      ]);
    }
  });

  it('эксперт открывает разговор только по опубликованной вакансии', async () => {
    const withoutOpp = await as('expert').rpc('start_conversation', {
      target_expert_id: EXPERT_PUBLIC,
      initial_body: 'No opportunity context',
    });
    expect(withoutOpp.error).not.toBeNull();

    const withOpp = await as('expert').rpc('start_conversation', {
      target_expert_id: EXPERT_PUBLIC,
      initial_body: 'I am interested in this lectureship.',
      related_opportunity_id: OPPORTUNITY_PUBLISHED,
    });
    expect(withOpp.error).toBeNull();

    const { data: messages } = await as('institution')
      .from('messages')
      .select('body')
      .eq('conversation_id', withOpp.data!);
    expect(messages).toEqual([{ body: 'I am interested in this lectureship.' }]);
  });

  it('чужой эксперт не читает чужой разговор (IDOR)', async () => {
    const { data: conversationId } = await as('institution').rpc('start_conversation', {
      target_expert_id: EXPERT_PUBLIC,
      initial_body: 'Private thread',
    });

    const { data } = await as('hiddenExpert')
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId!);
    expect(data).toEqual([]);
  });
});
