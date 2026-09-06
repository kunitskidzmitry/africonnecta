import type { SupabaseClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { anon, DATABASE_URL, signInAs } from './local-stack';

/**
 * Доступ к файлам эксперта: фотография и CV (§7, строка «Загрузка файлов»).
 *
 * Проверяется здесь не загрузка, а право на чтение. Файл в приватном бакете
 * недостижим сам по себе, поэтому вопрос всегда один: кому Postgres отдаёт строку
 * `public.files` и объект `storage.objects`. Подписанную ссылку хранилище выдаёт
 * ровно тому, кто прошёл политику select — то есть политика и есть замок.
 *
 * Асимметрия фотографии и CV намеренная и взята из §8.1. Фотография — часть
 * публичной витрины: она видна каждому, кому виден сам профиль. CV — вложение
 * к контактам, и §7 называет его выкачивание главным риском: его отдают только
 * той институции, которая уже потратила квоту на раскрытие контактов этого
 * эксперта, то есть по строке в `contact_disclosures`.
 *
 * Тест сам расставляет фикстуры и сам их убирает: сид про файлы ничего не знает,
 * а зависеть от порядка запусков проверка права не должна.
 */

const BUCKET = 'expert-files';

/** Идентификаторы из сида. */
const EXPERT_PUBLIC = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const EXPERT_HIDDEN = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const EXPERT_DRAFT = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const INSTITUTION_VERIFIED = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_EXPERT = '11111111-1111-1111-1111-111111111111';
const USER_HIDDEN = '44444444-4444-4444-4444-444444444444';
const USER_DRAFT = '55555555-5555-5555-5555-555555555555';

/** Фикстуры этого файла. Версия 4 в uuid — чтобы отличать их от сидовых. */
const FILE_PHOTO_PUBLIC = '10000000-0000-4000-8000-000000000001';
const FILE_CV_PUBLIC = '10000000-0000-4000-8000-000000000002';
const FILE_PHOTO_HIDDEN = '10000000-0000-4000-8000-000000000003';
const FILE_PHOTO_DRAFT = '10000000-0000-4000-8000-000000000004';
const FILE_UNATTACHED = '10000000-0000-4000-8000-000000000005';

type Fixture = {
  id: string;
  owner: string;
  ownerEmail: string;
  kind: 'photo' | 'cv';
  mime: string;
};

const EXPERT_EMAIL = 'expert@example.test';
const HIDDEN_EMAIL = 'expert.hidden@example.test';
const DRAFT_EMAIL = 'expert.draft@example.test';

const FIXTURES: Fixture[] = [
  {
    id: FILE_PHOTO_PUBLIC,
    owner: USER_EXPERT,
    ownerEmail: EXPERT_EMAIL,
    kind: 'photo',
    mime: 'image/jpeg',
  },
  {
    id: FILE_CV_PUBLIC,
    owner: USER_EXPERT,
    ownerEmail: EXPERT_EMAIL,
    kind: 'cv',
    mime: 'application/pdf',
  },
  {
    id: FILE_PHOTO_HIDDEN,
    owner: USER_HIDDEN,
    ownerEmail: HIDDEN_EMAIL,
    kind: 'photo',
    mime: 'image/jpeg',
  },
  {
    id: FILE_PHOTO_DRAFT,
    owner: USER_DRAFT,
    ownerEmail: DRAFT_EMAIL,
    kind: 'photo',
    mime: 'image/jpeg',
  },
  {
    id: FILE_UNATTACHED,
    owner: USER_EXPERT,
    ownerEmail: EXPERT_EMAIL,
    kind: 'photo',
    mime: 'image/jpeg',
  },
];

function keyOf(file: Fixture): string {
  return `${file.owner}/${file.kind}/${file.id}.${file.kind === 'cv' ? 'pdf' : 'jpg'}`;
}

/** Содержимое фикстур: правильная сигнатура, дальше несколько байт для объёма. */
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x00, 0x00]);
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

const db = new Client({ connectionString: DATABASE_URL });

const clients = new Map<string, SupabaseClient>();

async function as(email: string): Promise<SupabaseClient> {
  const existing = clients.get(email);
  if (existing) return existing;

  const client = await signInAs(email);
  clients.set(email, client);
  return client;
}

/** Видит ли этот клиент строку файла. */
async function canReadRow(client: SupabaseClient, fileId: string): Promise<boolean> {
  const { data, error } = await client.from('files').select('id').eq('id', fileId).maybeSingle();

  if (error) throw new Error(`Запрос строки файла не выполнился: ${error.message}`);

  return data !== null;
}

/**
 * Может ли этот клиент получить ссылку на содержимое.
 *
 * Отдельная проверка от canReadRow, а не следствие: строка живёт в public.files,
 * объект — в storage.objects, и это две разные политики. Разъехаться они могут
 * молча, и разъедутся именно в опасную сторону — строку видно, объект нет
 * (сломанная картинка) или, хуже, наоборот.
 */
async function canReadObject(client: SupabaseClient, file: Fixture): Promise<boolean> {
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(keyOf(file), 60);

  if (error) return false;

  return typeof data?.signedUrl === 'string';
}

async function cleanUp(): Promise<void> {
  await db.query(
    `update public.experts
        set photo_file_id = null, cv_file_id = null
      where id = any ($1::uuid[])`,
    [[EXPERT_PUBLIC, EXPERT_HIDDEN, EXPERT_DRAFT]],
  );
  await db.query('delete from storage.objects where bucket_id = $1 and name = any ($2::text[])', [
    BUCKET,
    FIXTURES.map(keyOf),
  ]);
  await db.query('delete from public.files where id = any ($1::uuid[])', [
    FIXTURES.map((file) => file.id),
  ]);
  await db.query('delete from public.contact_disclosures where institution_id = $1', [
    INSTITUTION_VERIFIED,
  ]);
  await db.query("delete from public.audit_log where action = 'expert.contacts.reveal'");
}

beforeAll(async () => {
  await db.connect();

  // Storage API запрещает прямое удаление объектов триггером protect_delete — он
  // спасает от осиротевших файлов в хранилище при ручной чистке базы. Тест снимает
  // запрет на своём соединении: настоящих байтов у его фикстур и нет, сиротеть нечему.
  await db.query("select set_config('storage.allow_delete_query', 'true', false)");
  await cleanUp();

  // Фикстуры создаются напрямую в базе, потому что клиентским ролям запись в бакет
  // и в public.files запрещена — в этом и состоит решение миграции 20260906230000.
  // Служебный ключ тесты не используют (README), а проверяется здесь право на чтение:
  // подписать ссылку хранилище позволяет по строке объекта, содержимое для этого
  // не требуется.
  for (const file of FIXTURES) {
    const body = file.kind === 'cv' ? PDF_BYTES : JPEG_BYTES;

    await db.query(
      `insert into public.files (id, owner_user_id, storage_key, kind, mime_type, size_bytes, scan_status)
       values ($1, $2, $3, $4, $5, $6, 'pending')`,
      [file.id, file.owner, keyOf(file), file.kind, file.mime, body.byteLength],
    );

    await db.query(
      `insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
       values ($1, $2, $3::uuid, $3::uuid::text, jsonb_build_object('size', $4::int, 'mimetype', $5::text))`,
      [BUCKET, keyOf(file), file.owner, body.byteLength, file.mime],
    );
  }

  await db.query('update public.experts set photo_file_id = $2, cv_file_id = $3 where id = $1', [
    EXPERT_PUBLIC,
    FILE_PHOTO_PUBLIC,
    FILE_CV_PUBLIC,
  ]);
  await db.query('update public.experts set photo_file_id = $2 where id = $1', [
    EXPERT_HIDDEN,
    FILE_PHOTO_HIDDEN,
  ]);
  await db.query('update public.experts set photo_file_id = $2 where id = $1', [
    EXPERT_DRAFT,
    FILE_PHOTO_DRAFT,
  ]);
});

afterAll(async () => {
  await cleanUp();
  await db.end();
});

// ---------------------------------------------------------------------------
// Фотография: видна тому, кому виден профиль
// ---------------------------------------------------------------------------

describe('фотография эксперта', () => {
  it('гость видит фотографию опубликованного публичного профиля', async () => {
    const guest = anon();

    expect(await canReadRow(guest, FILE_PHOTO_PUBLIC)).toBe(true);
    expect(
      await canReadObject(guest, FIXTURES[0]!),
      'строка видна, а объект нет — сломанная картинка вместо фотографии',
    ).toBe(true);
  });

  it('гость не видит фотографию скрытого профиля', async () => {
    const guest = anon();

    expect(await canReadRow(guest, FILE_PHOTO_HIDDEN)).toBe(false);
    expect(await canReadObject(guest, FIXTURES[2]!)).toBe(false);
  });

  it('гость не видит фотографию черновика', async () => {
    const guest = anon();

    expect(await canReadRow(guest, FILE_PHOTO_DRAFT)).toBe(false);
    expect(await canReadObject(guest, FIXTURES[3]!)).toBe(false);
  });

  it('владелец видит свою фотографию до публикации', async () => {
    const draftExpert = await as(DRAFT_EMAIL);

    expect(await canReadRow(draftExpert, FILE_PHOTO_DRAFT)).toBe(true);
    expect(await canReadObject(draftExpert, FIXTURES[3]!)).toBe(true);
  });

  it('загруженный, но не прикреплённый файл виден только владельцу', async () => {
    const guest = anon();
    const owner = await as(EXPERT_EMAIL);

    expect(await canReadRow(guest, FILE_UNATTACHED)).toBe(false);
    expect(await canReadRow(owner, FILE_UNATTACHED)).toBe(true);
  });

  /**
   * Файл, помеченный заражённым, перестаёт отдаваться.
   *
   * Сканера в Фазе 1 нет и статус остаётся pending (ADR-0008), поэтому проверка
   * выглядит проверкой недостижимого. Она проверяет другое: что замок для сканера
   * уже врезан. Появление сканера тогда сводится к тому, кто ставит статус,
   * а не к правке политик по всем таблицам сразу.
   */
  it('заражённый файл не отдаётся даже владельцу', async () => {
    const owner = await as(EXPERT_EMAIL);

    await db.query("update public.files set scan_status = 'infected' where id = $1", [
      FILE_PHOTO_PUBLIC,
    ]);

    try {
      expect(await canReadRow(anon(), FILE_PHOTO_PUBLIC)).toBe(false);
      expect(await canReadRow(owner, FILE_PHOTO_PUBLIC)).toBe(false);
      expect(await canReadObject(owner, FIXTURES[0]!)).toBe(false);
    } finally {
      await db.query("update public.files set scan_status = 'pending' where id = $1", [
        FILE_PHOTO_PUBLIC,
      ]);
    }
  });
});

// ---------------------------------------------------------------------------
// CV: только после раскрытия контактов
// ---------------------------------------------------------------------------

describe('CV эксперта', () => {
  it('гость не видит CV опубликованного профиля', async () => {
    const guest = anon();

    expect(await canReadRow(guest, FILE_CV_PUBLIC)).toBe(false);
    expect(await canReadObject(guest, FIXTURES[1]!)).toBe(false);
  });

  it('другой эксперт не видит чужое CV', async () => {
    const other = await as(DRAFT_EMAIL);

    expect(await canReadRow(other, FILE_CV_PUBLIC)).toBe(false);
    expect(await canReadObject(other, FIXTURES[1]!)).toBe(false);
  });

  it('институция не видит CV, пока не раскрыла контакты', async () => {
    const institution = await as('institution@example.test');

    expect(await canReadRow(institution, FILE_CV_PUBLIC)).toBe(false);
    expect(await canReadObject(institution, FIXTURES[1]!)).toBe(false);
  });

  it('институция видит CV после раскрытия контактов', async () => {
    const institution = await as('institution@example.test');

    const { error } = await institution.rpc('reveal_expert_contacts', {
      target_expert_id: EXPERT_PUBLIC,
    });

    expect(error, 'раскрытие контактов не сработало, проверять нечего').toBeNull();

    expect(await canReadRow(institution, FILE_CV_PUBLIC)).toBe(true);
    expect(await canReadObject(institution, FIXTURES[1]!)).toBe(true);
  });

  it('владелец видит своё CV всегда', async () => {
    const owner = await as(EXPERT_EMAIL);

    expect(await canReadRow(owner, FILE_CV_PUBLIC)).toBe(true);
    expect(await canReadObject(owner, FIXTURES[1]!)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Запись: свой префикс и свои файлы
// ---------------------------------------------------------------------------

/**
 * Запись — только серверная.
 *
 * Проверки ниже выглядят однообразно и в этом их смысл: закрыт каждый путь,
 * которым клиент мог бы обойти проверку сигнатуры. Стоит остаться одному —
 * и §7 («whitelist MIME с проверкой сигнатуры файла») превращается в просьбу,
 * потому что положить в хранилище что угодно можно будет мимо обработчика.
 *
 * Разрешать запись «в свою папку» тоже нельзя: свой файл и есть тот, который
 * подменяют. Проверять содержимое умеет только сервер, у которого байты на руках.
 */
describe('запись файлов клиентом', () => {
  const body = JPEG_BYTES;

  it('владелец не пишет даже в свою папку', async () => {
    const expert = await as(EXPERT_EMAIL);

    const { error } = await expert.storage
      .from(BUCKET)
      .upload(`${USER_EXPERT}/photo/bypass.jpg`, body, { contentType: 'image/jpeg' });

    expect(error, 'клиент загрузил файл в обход обработчика').not.toBeNull();
  });

  it('владелец не пишет в чужую папку', async () => {
    const expert = await as(EXPERT_EMAIL);

    const { error } = await expert.storage
      .from(BUCKET)
      .upload(`${USER_HIDDEN}/photo/stolen.jpg`, body, { contentType: 'image/jpeg' });

    expect(error, 'запись в чужую папку прошла').not.toBeNull();
  });

  it('гость не пишет ничего', async () => {
    const guest = anon();

    const { error } = await guest.storage
      .from(BUCKET)
      .upload(`${USER_EXPERT}/photo/guest.jpg`, body, { contentType: 'image/jpeg' });

    expect(error, 'гость загрузил файл').not.toBeNull();
  });

  it('клиент не создаёт строку файла', async () => {
    const expert = await as(EXPERT_EMAIL);
    const id = '10000000-0000-4000-8000-00000000000a';

    const { error } = await expert.from('files').insert({
      id,
      owner_user_id: USER_EXPERT,
      storage_key: `${USER_EXPERT}/photo/${id}.jpg`,
      kind: 'photo',
      mime_type: 'image/jpeg',
      size_bytes: 1024,
    });

    expect(error, 'клиент записал строку файла в обход проверки байтов').not.toBeNull();

    await db.query('delete from public.files where id = $1', [id]);
  });

  /**
   * Статус проверки клиент себе не ставит.
   *
   * Запись в files отозвана и политикой, и грантом (миграции 20260906230000 /
   * 20260906230100). Оба ответа законны: PostgREST на отсутствие политики UPDATE
   * обычно молчит (0 строк), а на revoke прав отвечает permission denied. Важно
   * одно — статус в базе не меняется.
   */
  it('клиент не переводит файл в проверенный статус', async () => {
    const expert = await as(EXPERT_EMAIL);

    await expert.from('files').update({ scan_status: 'clean' }).eq('id', FILE_PHOTO_PUBLIC);
    const { rows } = await db.query('select scan_status from public.files where id = $1', [
      FILE_PHOTO_PUBLIC,
    ]);

    expect(rows[0]?.scan_status, 'клиент объявил свой файл проверенным').toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// Привязка файла к профилю
// ---------------------------------------------------------------------------

describe('привязка файла к профилю', () => {
  /**
   * Чужой файл в свой профиль не прикрепляется.
   *
   * Внешний ключ на files(id) проверяет существование, а не владение, поэтому
   * без отдельной проверки любой эксперт мог бы выставить у себя фотографию
   * чужого профиля — идентификатор фотографии видимого профиля читается законно,
   * он приходит в выдаче поиска. Подделка чужого лица в своей карточке ломает §11
   * (доверие) дешевле, чем что-либо ещё в системе.
   */
  it('эксперт не прикрепляет чужой файл', async () => {
    const draftExpert = await as(DRAFT_EMAIL);

    const { error } = await draftExpert
      .from('experts')
      .update({ photo_file_id: FILE_UNATTACHED })
      .eq('id', EXPERT_DRAFT);

    expect(error, 'чужой файл прикреплён к профилю').not.toBeNull();
  });

  it('эксперт прикрепляет свой файл', async () => {
    const expert = await as(EXPERT_EMAIL);

    const { error } = await expert
      .from('experts')
      .update({ photo_file_id: FILE_UNATTACHED })
      .eq('id', EXPERT_PUBLIC);

    expect(error?.message ?? null).toBeNull();

    await db.query('update public.experts set photo_file_id = $2 where id = $1', [
      EXPERT_PUBLIC,
      FILE_PHOTO_PUBLIC,
    ]);
  });
});
