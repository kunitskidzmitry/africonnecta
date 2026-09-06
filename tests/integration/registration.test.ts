import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { anon, DATABASE_URL, MAILPIT_URL } from './local-stack';

/**
 * Сквозная проверка регистрации (WP3) против локального стека Supabase.
 *
 * Тест намеренно идёт настоящим путём: HTTP-вызов signUp публичным ключом, реальное
 * письмо в Mailpit, подтверждение по token_hash из этого письма. Проверять триггер
 * запросом в базу было бы проще, но тогда вне проверки остались бы ровно те места,
 * где регистрация ломается на практике: шаблон письма, настройки auth и список
 * разрешённых адресов редиректа.
 *
 * Служебный ключ (service_role) здесь не используется сознательно. Приложение обходится
 * без него, и тесту он тоже не нужен: со стороны клиента работает публичный ключ — тот же,
 * что у любого посетителя, — а состояние базы проверяется прямым подключением к Postgres.
 * Ключ, которого нет в репозитории, невозможно случайно утащить в клиентский бандл.
 *
 * Запуск: `npm run db:start`, затем `npm run test:integration`.
 * Значения ниже не секретны: `supabase start` поднимает стек с фиксированными
 * демонстрационными параметрами, одинаковыми на любой машине.
 */

const REDIRECT_TO = 'http://localhost:3100/api/auth/confirm?next=%2Fen%2Fwelcome';

// Домен .test зарезервирован RFC 2606: письма гарантированно никуда не уйдут.
// Он же требуется предохранителем в supabase/seed.sql.
const stamp = Date.now();
const expertEmail = `expert.${stamp}@example.test`;
const institutionEmail = `institution.${stamp}@example.test`;
const password = 'a-sufficiently-long-passphrase';

const db = new Client({ connectionString: DATABASE_URL });

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await db.query(sql, params);
  return result.rows as T[];
}

async function userExists(email: string): Promise<boolean> {
  const rows = await query<{ count: string }>(
    'select count(*)::text as count from auth.users where email = $1',
    [email],
  );

  return rows[0]?.count !== '0';
}

async function waitForConfirmationToken(address: string): Promise<string> {
  // Письмо уходит асинхронно, поэтому короткий опрос вместо фиксированной паузы.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const list = (await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`).then((r) => r.json())) as {
      messages: { ID: string; To: { Address: string }[] }[];
    };

    const match = list.messages.find((message) =>
      message.To.some((recipient) => recipient.Address.toLowerCase() === address.toLowerCase()),
    );

    if (match) {
      const body = (await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`).then((r) =>
        r.json(),
      )) as { HTML: string };

      const token = /token_hash=([^&"'\s]+)/.exec(body.HTML)?.[1];
      if (!token) {
        throw new Error(`В письме для ${address} нет token_hash. Проверь шаблон подтверждения.`);
      }

      return token;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Письмо для ${address} не пришло. Включён ли enable_confirmations?`);
}

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  // Удаление auth.users каскадом убирает профиль, институцию и членство.
  await db.query('delete from auth.users where email like $1', [`%.${stamp}@example.test`]);
  await db.end();
});

describe('регистрация эксперта', () => {
  let userId: string;

  it('создаёт учётную запись и не выдаёт сессию до подтверждения почты', async () => {
    const { data, error } = await anon().auth.signUp({
      email: expertEmail,
      password,
      options: {
        emailRedirectTo: REDIRECT_TO,
        data: {
          role: 'expert',
          first_name: 'Aline',
          last_name: 'Uwase',
          phone: '+250788000111',
          country: 'RW',
          current_institution: 'INES Ruhengeri',
          title: 'Senior Lecturer',
          highest_degree: 'PhD Physics',
          bio: 'Physicist working on renewable energy.',
          locale: 'en',
        },
      },
    });

    expect(error).toBeNull();
    // Главное здесь: сессии нет. Иначе неподтверждённый адрес давал бы рабочий вход.
    expect(data.session).toBeNull();
    expect(data.user?.id).toBeTruthy();

    userId = data.user!.id;
  });

  it('создаёт профиль эксперта в той же транзакции', async () => {
    const [profile] = await query<{ role: string; status: string; locale: string }>(
      'select role::text, status::text, locale from public.users where id = $1',
      [userId],
    );

    expect(profile).toMatchObject({ role: 'expert', status: 'pending', locale: 'en' });

    const [expert] = await query<Record<string, string>>(
      `select e.first_name, e.last_name, e.phone, e.current_institution_name, e.title, c.iso2
       from public.experts e join public.countries c on c.id = e.country_id
       where e.user_id = $1`,
      [userId],
    );

    expect(expert).toMatchObject({
      first_name: 'Aline',
      last_name: 'Uwase',
      phone: '+250788000111',
      current_institution_name: 'INES Ruhengeri',
      title: 'Senior Lecturer',
      iso2: 'RW',
    });
  });

  it('переводит учётную запись в active по ссылке из письма', async () => {
    const tokenHash = await waitForConfirmationToken(expertEmail);

    const { data, error } = await anon().auth.verifyOtp({ type: 'signup', token_hash: tokenHash });

    expect(error).toBeNull();
    expect(data.session).not.toBeNull();

    const [profile] = await query<{ status: string }>(
      'select status::text from public.users where id = $1',
      [userId],
    );
    expect(profile?.status).toBe('active');
  });

  it('показывает пользователю только его собственную строку', async () => {
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: expertEmail, password });
    expect(error).toBeNull();

    // В базе есть и другие пользователи (сид), но политика users_select_own
    // обязана вернуть ровно одну строку — свою.
    const { data } = await client.from('users').select('id');

    expect(data).toEqual([{ id: userId }]);
  });
});

describe('регистрация института', () => {
  it('создаёт институцию и делает регистрирующего владельцем', async () => {
    const { data, error } = await anon().auth.signUp({
      email: institutionEmail,
      password,
      options: {
        emailRedirectTo: REDIRECT_TO,
        data: {
          role: 'institution_member',
          organization_name: 'Kigali Institute of Science',
          institution_type: 'research_institute',
          country: 'RW',
          website: 'https://kis.example',
          contact_person: 'Jean Baptiste',
          phone: '+250788222333',
          locale: 'en',
        },
      },
    });

    expect(error).toBeNull();
    const userId = data.user!.id;

    const [membership] = await query<Record<string, string | null>>(
      `select m.role::text as member_role, i.name, i.type::text, i.contact_email,
              i.contact_person, i.verified_at
       from public.institution_members m join public.institutions i on i.id = m.institution_id
       where m.user_id = $1`,
      [userId],
    );

    expect(membership).toMatchObject({
      member_role: 'owner',
      name: 'Kigali Institute of Science',
      type: 'research_institute',
      contact_email: institutionEmail,
      contact_person: 'Jean Baptiste',
    });
    // Институция не верифицирована: право писать экспертам появляется только
    // после проверки (§9, «спам от институций»).
    expect(membership?.verified_at).toBeNull();
  });
});

describe('попытки злоупотребления', () => {
  it('не выдаёт роль admin по метаданным', async () => {
    const email = `hacker.${stamp}@example.test`;

    const { error } = await anon().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: REDIRECT_TO, data: { role: 'admin', country: 'RW' } },
    });

    expect(error).not.toBeNull();
    // Ключевая проверка: транзакция откатилась целиком, учётной записи не осталось.
    expect(await userExists(email)).toBe(false);
  });

  it('отклоняет страну вне справочника', async () => {
    const email = `nowhere.${stamp}@example.test`;

    const { error } = await anon().auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: REDIRECT_TO,
        data: {
          role: 'expert',
          first_name: 'A',
          last_name: 'B',
          country: 'ZZ',
          current_institution: 'X',
        },
      },
    });

    expect(error).not.toBeNull();
    expect(await userExists(email)).toBe(false);
  });

  it('не отдаёт профили анонимному посетителю', async () => {
    const { data } = await anon().from('users').select('id');

    // RLS закрыт по умолчанию: без сессии не видно ничего (§8.2).
    expect(data).toEqual([]);
  });
});
