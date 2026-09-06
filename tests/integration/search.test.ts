import type { SupabaseClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/lib/database.types';

import { anon, DATABASE_URL, signInAs } from './local-stack';

/**
 * Поиск экспертов (M2). Права проверяются раньше, чем появляется выдача.
 *
 * Поиск — первый списочный эндпоинт продукта, то есть главный вектор выкачивания базы
 * (§7). Поэтому здесь не «работает ли поиск», а «что именно он отдаёт и кому»:
 *
 *  - контактов в списке нет ни для кого, включая администратора;
 *  - чужой черновик и скрытый профиль не попадают в выдачу никому, даже владельцу
 *    и администратору, которым RLS сами строки показать разрешает;
 *  - профиль «только для вошедших» гостю не виден, а заблокированному пользователю
 *    не виден тоже, хотя токен у него ещё действителен.
 *
 * Последние два пункта — причина, по которой тест написан до функции: и то и другое
 * легко потерять, реализуя поиск через security definer «чтобы работало».
 */

const EXPERT_PUBLIC = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const EXPERT_HIDDEN = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const EXPERT_DRAFT = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

/** Колонки, которых в списочной выдаче не должно быть ни при каких условиях (§7). */
const FORBIDDEN_COLUMNS = ['phone', 'email', 'cv_file_id', 'user_id'];

type SearchArgs = Parameters<SupabaseClient<Database>['rpc']>[1] &
  Database['public']['Functions']['search_experts']['Args'];

type SearchRow = {
  id: string;
  first_name: string;
  last_name: string;
  rank: number;
  published_at: string;
  expertise_ids: number[] | null;
  language_ids: number[] | null;
};

const db = new Client({ connectionString: DATABASE_URL });

let expert: SupabaseClient<Database>;
let institution: SupabaseClient<Database>;
let admin: SupabaseClient<Database>;
let suspended: SupabaseClient<Database>;

async function search(
  client: SupabaseClient<Database>,
  args: SearchArgs = {},
): Promise<SearchRow[]> {
  const { data, error } = await client.rpc('search_experts', args);

  if (error) throw new Error(`Поиск не выполнился: ${error.message}`);

  return (data ?? []) as SearchRow[];
}

function ids(rows: SearchRow[]): string[] {
  return rows.map((row) => row.id);
}

/**
 * Слово, которого нет ни у кого, кроме подопытного профиля.
 *
 * Тесты обязаны проходить и на базе с десятью тысячами профилей: замер производительности
 * (`npm run db:seed:bulk`) оставляет её именно такой, и суите нельзя зависеть от того,
 * запускали ли его. Первая версия искала «Habimana» и на засеянной базе падала — таких
 * фамилий в массовом сиде восемьсот, и засеянный профиль просто не попадал в первые
 * двадцать. Проверялось при этом не то, что тест утверждал: не «находится ли профиль»,
 * а «оказался ли он выше прочих».
 */
const MARKER = 'zzqmarkerxyz';

/** Дописывает маркер в биографию: search_document генерируемая, пересчёт бесплатный. */
async function withMarker(expertId: string, body: () => Promise<void>): Promise<void> {
  const { rows } = await db.query<{ bio: string | null }>(
    'select bio from public.experts where id = $1',
    [expertId],
  );
  const previous = rows[0]?.bio ?? null;

  await db.query('update public.experts set bio = $2 where id = $1', [
    expertId,
    `${previous ?? ''} ${MARKER}`,
  ]);

  try {
    await body();
  } finally {
    await db.query('update public.experts set bio = $2 where id = $1', [expertId, previous]);
  }
}

/** То же для названия института: поиск по написанию смотрит на имя и институт, не на био. */
async function withInstitution(
  expertId: string,
  name: string,
  body: () => Promise<void>,
): Promise<void> {
  const { rows } = await db.query<{ current_institution_name: string | null }>(
    'select current_institution_name from public.experts where id = $1',
    [expertId],
  );
  const previous = rows[0]?.current_institution_name ?? null;

  await db.query('update public.experts set current_institution_name = $2 where id = $1', [
    expertId,
    name,
  ]);

  try {
    await body();
  } finally {
    await db.query('update public.experts set current_institution_name = $2 where id = $1', [
      expertId,
      previous,
    ]);
  }
}

beforeAll(async () => {
  await db.connect();
  [expert, institution, admin, suspended] = await Promise.all([
    signInAs('expert@example.test'),
    signInAs('institution@example.test'),
    signInAs('admin@example.test'),
    signInAs('suspended@example.test'),
  ]);
});

afterAll(async () => {
  await Promise.all([
    expert.auth.signOut(),
    institution.auth.signOut(),
    admin.auth.signOut(),
    suspended.auth.signOut(),
    db.end(),
  ]);
});

describe('поиск: кого видно', () => {
  it('гость находит опубликованный открытый профиль', async () => {
    await withMarker(EXPERT_PUBLIC, async () => {
      const rows = await search(anon(), { q: MARKER });

      expect(ids(rows)).toEqual([EXPERT_PUBLIC]);
    });
  });

  it('гость не находит скрытый профиль', async () => {
    const rows = await search(anon(), { page_size: 100 });

    expect(ids(rows)).not.toContain(EXPERT_HIDDEN);
  });

  it('гость не находит черновик', async () => {
    const rows = await search(anon(), { page_size: 100 });

    expect(ids(rows)).not.toContain(EXPERT_DRAFT);
  });

  /**
   * Владельцу RLS показывает его собственную строку всегда — иначе он не отредактировал бы
   * черновик. Но поиск — списочная выдача, а не личный кабинет: неопубликованный профиль
   * не должен в неё попадать даже для владельца, иначе «опубликовать» перестаёт что-либо
   * значить, а сам владелец решит, что его черновик уже видят все.
   */
  it('владелец не находит собственный черновик', async () => {
    const draftOwner = await signInAs('expert.draft@example.test');

    try {
      const rows = await search(draftOwner, { page_size: 100 });

      expect(ids(rows)).not.toContain(EXPERT_DRAFT);
    } finally {
      await draftOwner.auth.signOut();
    }
  });

  /** Администратору RLS отдаёт все строки, но поиск обязан отвечать всем одинаково. */
  it('администратор не находит ни черновик, ни скрытый профиль', async () => {
    const rows = await search(admin, { page_size: 100 });

    expect(ids(rows)).not.toContain(EXPERT_DRAFT);
    expect(ids(rows)).not.toContain(EXPERT_HIDDEN);
  });
});

describe('поиск: видимость «только для вошедших»', () => {
  // В сиде такого профиля нет, поэтому переключаем скрытый на время проверки.
  async function withAuthenticatedVisibility(body: () => Promise<void>) {
    await db.query("update public.experts set profile_visibility = 'authenticated' where id = $1", [
      EXPERT_HIDDEN,
    ]);

    try {
      await body();
    } finally {
      await db.query("update public.experts set profile_visibility = 'hidden' where id = $1", [
        EXPERT_HIDDEN,
      ]);
    }
  }

  it('гость такой профиль не находит, а вошедший находит', async () => {
    await withAuthenticatedVisibility(async () => {
      const guestRows = await search(anon(), { page_size: 100 });
      const memberRows = await search(institution, { page_size: 100 });

      expect(ids(guestRows)).not.toContain(EXPERT_HIDDEN);
      expect(ids(memberRows)).toContain(EXPERT_HIDDEN);
    });
  });

  /**
   * У заблокированного пользователя токен остаётся действительным до истечения срока,
   * поэтому «проверить наличие сессии» здесь недостаточно. Политика смотрит на роль,
   * а current_user_role() у заблокированного возвращает null.
   */
  it('заблокированный пользователь такой профиль не находит', async () => {
    await withAuthenticatedVisibility(async () => {
      const rows = await search(suspended, { page_size: 100 });

      expect(ids(rows)).not.toContain(EXPERT_HIDDEN);
    });
  });
});

describe('поиск: чего в выдаче нет', () => {
  it.each([
    ['гость', () => anon()],
    ['эксперт', () => expert],
    ['институция', () => institution],
    ['администратор', () => admin],
  ])('%s не получает контактов в списке', async (_name, client) => {
    const rows = await search(client(), { page_size: 100 });

    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      for (const column of FORBIDDEN_COLUMNS) {
        expect(Object.keys(row)).not.toContain(column);
      }
    }
  });

  it('телефон не достаётся и прямым запросом колонки', async () => {
    const { error } = await anon().from('experts').select('id, phone');

    expect(error).not.toBeNull();
  });

  /**
   * Проверка выше смотрит на то, что вернулось, и потому зависит от данных: колонки нет
   * в ответе — возможно, потому что её нет в типе, а возможно, потому что в этом прогоне
   * не нашлось строк с заполненным телефоном. Здесь спрашивается сам тип, один для обеих
   * функций выдачи, — и ответ не зависит ни от сида, ни от прав вызывающего.
   */
  it('в типе строки выдачи нет контактных колонок', async () => {
    const { rows } = await db.query<{ attname: string }>(
      `select a.attname
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'expert_search_row' and a.attnum > 0
       order by a.attnum`,
    );

    const columns = rows.map((row) => row.attname);

    expect(columns).not.toHaveLength(0);
    expect(columns.filter((column) => FORBIDDEN_COLUMNS.includes(column))).toEqual([]);
  });
});

describe('пустая выдача (§10)', () => {
  it('область расширяется до поддерева своего корня', async () => {
    const { rows } = await db.query<{ child: number; root: number; siblings: number[] }>(
      `select child.id as child, root.id as root,
              (select array_agg(s.id order by s.id)
               from public.expertise s
               where s.id = root.id or s.parent_id = root.id) as siblings
       from public.expertise child
       join public.expertise root on root.id = child.parent_id
       order by child.id
       limit 1`,
    );

    const sample = rows[0];

    if (!sample) throw new Error('В справочнике нет вложенных областей');

    const { data, error } = await anon().rpc('expertise_broaden', { ids: [sample.child] });

    expect(error).toBeNull();
    expect(data).toEqual(sample.siblings);
    // Расширение обязано быть надмножеством запроса: иначе на пустой выдаче пропали бы
    // и те совпадения, которых не было, и те, которые были.
    expect(data).toContain(sample.child);
  });

  it('уже целое поддерево не расширяется — вызывающему видно, что расширять нечего', async () => {
    const { rows } = await db.query<{ subtree: number[] }>(
      `select array_agg(s.id order by s.id) as subtree
       from public.expertise s
       where s.id = 3 or s.parent_id = 3`,
    );

    const subtree = rows[0]?.subtree;

    if (!subtree) throw new Error('В справочнике нет области с детьми');

    const { data } = await anon().rpc('expertise_broaden', { ids: subtree });

    expect(data).toEqual(subtree);
  });

  it('поиск с опечаткой в названии института находит профиль', async () => {
    await withInstitution(EXPERT_PUBLIC, 'Zqmarker Institute of Kigali', async () => {
      const { data, error } = await anon().rpc('search_experts_similar', {
        // Пропущенная буква и переставленная пара — то, что §4.8 называет опечаткой.
        q: 'Zqmarker Institue of Kgali',
        page_size: 20,
      });

      expect(error).toBeNull();
      expect((data ?? []).map((row) => row.id)).toContain(EXPERT_PUBLIC);
    });
  });

  it('пустой запрос не превращается в выдачу всех подряд', async () => {
    const { data } = await anon().rpc('search_experts_similar', { q: '   ', page_size: 20 });

    expect(data ?? []).toEqual([]);
  });

  /**
   * Запасной путь — то самое место, где видимость теряют: функция другая, писалась позже,
   * и соблазн «здесь же просто подсказка» сильнее всего. Скрытый профиль и черновик
   * не должны находиться и по написанию имени.
   */
  it('скрытый профиль и черновик не находятся и по сходству', async () => {
    const { rows } = await db.query<{ id: string; name: string }>(
      `select id, first_name || ' ' || last_name as name
       from public.experts where id = any($1)`,
      [[EXPERT_HIDDEN, EXPERT_DRAFT]],
    );

    expect(rows).toHaveLength(2);

    for (const row of rows) {
      const { data } = await anon().rpc('search_experts_similar', {
        q: row.name,
        page_size: 100,
      });

      expect((data ?? []).map((found) => found.id)).not.toContain(row.id);
    }
  });
});

describe('поиск: фасеты и порядок', () => {
  /** Делает все три засеянных профиля видимыми, чтобы проверить отбор и страницы. */
  async function withThreeVisible(body: () => Promise<void>) {
    await db.query(
      `update public.experts
         set published_at = coalesce(published_at, now()), profile_visibility = 'public'
       where id = any($1)`,
      [[EXPERT_PUBLIC, EXPERT_HIDDEN, EXPERT_DRAFT]],
    );

    try {
      await body();
    } finally {
      await db.query("update public.experts set profile_visibility = 'hidden' where id = $1", [
        EXPERT_HIDDEN,
      ]);
      await db.query('update public.experts set published_at = null where id = $1', [EXPERT_DRAFT]);
    }
  }

  /**
   * Проверяются два разных утверждения, и оба нужны.
   *
   * Что фильтр не пропускает лишнего — вложением выдачи в множество подходящих строк.
   * Что он не отсекает нужного — отдельным запросом с маркером: страница вмещает сто
   * строк, а подходящих в засеянной базе восемь тысяч, поэтому равенство множеств
   * проверяло бы не фильтр, а размер страницы.
   */
  it('фильтр по стране оставляет только её экспертов', async () => {
    await withThreeVisible(async () => {
      const { rows } = await db.query<{ id: number }>(
        "select id from public.countries where iso2 = 'RW'",
      );
      const rwanda = rows[0]?.id;

      if (rwanda === undefined) throw new Error('В справочнике нет Руанды');

      const found = await search(anon(), { filter_country_ids: [rwanda], page_size: 100 });
      const { rows: eligible } = await db.query<{ id: string }>(
        `select id from public.experts
         where country_id = $1 and published_at is not null
           and deleted_at is null and profile_visibility <> 'hidden'`,
        [rwanda],
      );
      const eligibleIds = new Set(eligible.map((row) => row.id));

      expect(found.length).toBeGreaterThan(0);

      for (const id of ids(found)) {
        expect(eligibleIds).toContain(id);
      }

      await withMarker(EXPERT_PUBLIC, async () => {
        const narrowed = await search(anon(), { q: MARKER, filter_country_ids: [rwanda] });

        expect(ids(narrowed)).toEqual([EXPERT_PUBLIC]);
      });
    });
  });

  it('фильтр по области экспертизы оставляет только её экспертов', async () => {
    await withThreeVisible(async () => {
      const { rows } = await db.query<{ expertise_id: number; expert_id: string }>(
        `select x.expertise_id, x.expert_id
         from public.expert_expertise x
         join public.experts e on e.id = x.expert_id
         where e.id = $1
         limit 1`,
        [EXPERT_PUBLIC],
      );
      const pick = rows[0];

      if (!pick) throw new Error('У засеянного эксперта нет областей экспертизы');

      const found = await search(anon(), {
        filter_expertise_ids: [pick.expertise_id],
        page_size: 100,
      });

      expect(found.length).toBeGreaterThan(0);

      // Каждая выданная строка обязана нести запрошенную область: это и есть фильтр.
      for (const row of found) {
        expect(row.expertise_ids ?? []).toContain(pick.expertise_id);
      }

      // А сам подопытный обязан находиться — но искать его надо запросом, в котором
      // он один, иначе проверяется место в сортировке, а не работа фильтра.
      await withMarker(pick.expert_id, async () => {
        const narrowed = await search(anon(), {
          q: MARKER,
          filter_expertise_ids: [pick.expertise_id],
        });

        expect(ids(narrowed)).toEqual([pick.expert_id]);
      });
    });
  });

  /**
   * Keyset-пагинация обязана быть разбиением: ни пропусков, ни повторов.
   * Именно это ломается первым, если в сортировке нет уникального хвоста —
   * строки с одинаковым рангом начинают перескакивать между страницами.
   */
  it('страницы по одной записи покрывают выдачу без пропусков и повторов', async () => {
    await withThreeVisible(async () => {
      const all = await search(anon(), { page_size: 100 });

      expect(all.length).toBeGreaterThanOrEqual(3);

      const walked: string[] = [];
      let cursor: SearchRow | undefined;

      for (let page = 0; page < all.length; page += 1) {
        const rows = await search(anon(), {
          page_size: 1,
          after_rank: cursor?.rank,
          after_published_at: cursor?.published_at,
          after_id: cursor?.id,
        });

        expect(rows).toHaveLength(1);
        walked.push(rows[0]!.id);
        cursor = rows[0];
      }

      expect(walked).toEqual(ids(all));
      expect(new Set(walked).size).toBe(walked.length);
    });
  });
});
