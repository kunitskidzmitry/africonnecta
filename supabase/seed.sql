-- Тестовые данные для ЛОКАЛЬНОЙ разработки.
--
-- Применяется автоматически при `npm run db:reset` (см. [db.seed] в config.toml).
-- Справочники (страны, языки, области экспертизы) сюда НЕ входят: они нужны и в проде,
-- поэтому живут в миграции 20260906140100_reference_data.sql.
--
-- Идентификаторы фиксированные: на них будут ссылаться тесты матрицы авторизации (§8.1).
-- Пароль у всех учётных записей: password123
-- Почта на домене .test — зарезервированный TLD, письма никуда не уйдут.

-- ---------------------------------------------------------------------------
-- Предохранитель
--
-- `supabase db reset --linked` применяет сид к подключённому проекту, а не к локальной
-- базе. Если в базе уже есть настоящие пользователи, выполнение прерывается.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from auth.users where email is null or email not like '%@example.test') then
    raise exception
      'Сид остановлен: в базе есть учётные записи вне домена example.test. '
      'Похоже, это не локальная база.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Учётные записи
--
-- Роли покрывают всю матрицу доступа §8.1: эксперт, владелец институции, администратор.
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'expert@example.test',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),

  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'institution@example.test',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),

  ('00000000-0000-0000-0000-000000000000',
   '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'admin@example.test',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),

  -- Второй эксперт: нужен, чтобы отличать «свой профиль» от «чужого». Без него
  -- строка матрицы «Expert (чужой)» непроверяема, а именно там живут IDOR.
  ('00000000-0000-0000-0000-000000000000',
   '44444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'expert.hidden@example.test',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),

  -- Эксперт с неопубликованным профилем.
  ('00000000-0000-0000-0000-000000000000',
   '55555555-5555-5555-5555-555555555555',
   'authenticated', 'authenticated', 'expert.draft@example.test',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),

  -- Представитель институции, которую ещё не проверили: право на контакты
  -- появляется только после верификации (§9).
  ('00000000-0000-0000-0000-000000000000',
   '66666666-6666-6666-6666-666666666666',
   'authenticated', 'authenticated', 'unverified@example.test',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),

  -- Заблокированный пользователь: проверяет, что статус отбирает права.
  ('00000000-0000-0000-0000-000000000000',
   '77777777-7777-7777-7777-777777777777',
   'authenticated', 'authenticated', 'suspended@example.test',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now());

-- GoTrue не умеет сканировать NULL в строковые токены
-- («converting NULL to string is unsupported»). Пользователи, созданные
-- через API, получают пустые строки; прямая вставка должна делать то же.
update auth.users
set
  confirmation_token = '',
  recovery_token = '',
  email_change_token_new = '',
  email_change_token_current = '',
  email_change = '',
  phone_change = '',
  phone_change_token = '',
  reauthentication_token = ''
where email like '%@example.test';

-- Без записи в auth.identities вход по паролю не работает.
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select
  u.id::text,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(),
  now()
from auth.users u;

-- ---------------------------------------------------------------------------
-- Профили приложения
-- ---------------------------------------------------------------------------

insert into users (id, role, status) values
  ('11111111-1111-1111-1111-111111111111', 'expert', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'institution_member', 'active'),
  ('33333333-3333-3333-3333-333333333333', 'admin', 'active'),
  ('44444444-4444-4444-4444-444444444444', 'expert', 'active'),
  ('55555555-5555-5555-5555-555555555555', 'expert', 'active'),
  ('66666666-6666-6666-6666-666666666666', 'institution_member', 'active'),
  ('77777777-7777-7777-7777-777777777777', 'expert', 'suspended');

-- ---------------------------------------------------------------------------
-- Институция
--
-- В Фазе 1 у институции ровно один участник с ролью owner (§2.5).
-- ---------------------------------------------------------------------------

insert into institutions (
  id, name, type, country_id, website, contact_person, contact_email, verified_at
)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'University of Rwanda',
  'university',
  (select id from countries where iso2 = 'RW'),
  'https://ur.ac.rw',
  'Esther M.',
  'institution@example.test',
  now()
);

insert into institution_members (institution_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'owner');

-- Институция без верификации: verified_at пустой.
insert into institutions (
  id, name, type, country_id, website, contact_person, contact_email
)
values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'Unverified Research Group',
  'research_institute',
  (select id from countries where iso2 = 'KE'),
  'https://urg.example',
  'Not Checked Yet',
  'unverified@example.test'
);

insert into institution_members (institution_id, user_id, role) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '66666666-6666-6666-6666-666666666666', 'owner');

-- ---------------------------------------------------------------------------
-- Профиль эксперта
--
-- Взят из макета дашборда (docs/transcription.md §5), чтобы данные на экранах
-- выглядели правдоподобно.
-- ---------------------------------------------------------------------------

insert into experts (
  id, user_id, first_name, last_name, title, academic_level, highest_degree,
  current_institution_id, current_institution_name, country_id, bio, phone,
  profile_visibility, published_at
)
values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '11111111-1111-1111-1111-111111111111',
  'Yves', 'Habimana',
  'Lecturer in Economics',
  'lecturer',
  'PhD Economics',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'University of Rwanda',
  (select id from countries where iso2 = 'RW'),
  'Lecturer in Economics working on development policy and climate adaptation in East Africa.',
  '+250788123456',
  'public',
  now()
);

-- Скрытый профиль: опубликован, но владелец не хочет быть найденным.
-- Не показывается никому, кроме самого владельца и администратора.
insert into experts (
  id, user_id, first_name, last_name, current_institution_name, country_id,
  phone, profile_visibility, published_at
)
values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '44444444-4444-4444-4444-444444444444',
  'Grace', 'Nyirahabimana',
  'Makerere University',
  (select id from countries where iso2 = 'UG'),
  '+256700111222',
  'hidden',
  now()
);

-- Черновик: профиль заполняется, публикации ещё не было.
insert into experts (
  id, user_id, first_name, last_name, current_institution_name, country_id,
  phone, profile_visibility
)
values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  '55555555-5555-5555-5555-555555555555',
  'Samuel', 'Otieno',
  'University of Nairobi',
  (select id from countries where iso2 = 'KE'),
  '+254700333444',
  'public'
);

insert into expert_expertise (expert_id, expertise_id, is_primary, years_experience)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   (select id from expertise where slug = 'economics'), true, 8),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   (select id from expertise where slug = 'public-policy'), false, 5),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   (select id from expertise where slug = 'climate-change'), false, 3);

insert into expert_languages (expert_id, language_id, proficiency)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   (select id from languages where iso639_1 = 'rw'), 'native'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   (select id from languages where iso639_1 = 'en'), 'c1'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   (select id from languages where iso639_1 = 'fr'), 'b2');

-- ---------------------------------------------------------------------------
-- Вакансии (M3)
--
-- Опубликованная — для доски и заявок. Черновик — чтобы проверить, что чужие
-- роли его не видят (§8.1 / deny by default).
-- ---------------------------------------------------------------------------

insert into opportunities (
  id, institution_id, created_by, title, description, type, mode,
  country_id, location, status, published_at
)
values (
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '22222222-2222-2222-2222-222222222222',
  'Guest Lecturer in Artificial Intelligence',
  'Deliver a short guest lecture series on AI applications in East African higher education.',
  'lectureship',
  'hybrid',
  (select id from countries where iso2 = 'RW'),
  'Kigali, Rwanda',
  'published',
  now()
);

insert into opportunities (
  id, institution_id, created_by, title, description, type, mode,
  country_id, status
)
values (
  'f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '22222222-2222-2222-2222-222222222222',
  'Internal draft — not for the board',
  'Draft opportunity used only in access-matrix tests.',
  'research',
  'online',
  (select id from countries where iso2 = 'RW'),
  'draft'
);

insert into opportunity_requirements (opportunity_id, kind, ref_value, is_mandatory)
values (
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  'expertise',
  (select id::text from expertise where slug = 'artificial-intelligence'),
  true
);
