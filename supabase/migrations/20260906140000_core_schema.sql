-- Схема ядра AfriConnecta. Соответствует §4.1-4.3 docs/implementation-prompt.md.
--
-- Принципы:
--   * Аутентификацию ведёт Supabase (auth.users). Мы не дублируем пароли и сессии,
--     а расширяем пользователя профилем public.users с тем же идентификатором.
--   * RLS включается на КАЖДОЙ таблице сразу. Без политик это означает полный запрет
--     для клиентских ключей — безопасное состояние по умолчанию (§8.2 deny by default).
--     Политики появятся в WP4 вместе с тестами матрицы доступа.
--   * Таксономии (страны, языки, области экспертизы) — справочники. Свободный ввод
--     запрещён, иначе фасетный поиск развалится (§4.3).

create extension if not exists citext;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Перечисления
-- ---------------------------------------------------------------------------

create type user_role as enum ('expert', 'institution_member', 'admin');
create type user_status as enum ('pending', 'active', 'suspended');
create type member_role as enum ('owner', 'admin', 'member');
create type profile_visibility as enum ('public', 'authenticated', 'hidden');

-- Значения заданы источником (Functional Spec §6).
create type academic_level as enum ('professor', 'lecturer', 'researcher', 'phd_candidate');

create type institution_type as enum (
  'university',
  'college',
  'research_institute',
  'government',
  'ngo',
  'international_organization',
  'other'
);

create type file_scan_status as enum ('pending', 'clean', 'infected', 'failed');

-- ---------------------------------------------------------------------------
-- Общие вспомогательные функции
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Справочники
-- ---------------------------------------------------------------------------

create table countries (
  id smallint generated always as identity primary key,
  iso2 char(2) not null unique,
  name text not null,
  region text,
  is_african boolean not null default false
);

comment on column countries.is_african is
  'Используется African Context Score (§5) и фасетом Geography (§6).';

create table languages (
  id smallint generated always as identity primary key,
  iso639_1 char(2) not null unique,
  name text not null
);

create table expertise (
  id integer generated always as identity primary key,
  slug text not null unique,
  label text not null,
  parent_id integer references expertise (id) on delete restrict
);

comment on table expertise is
  'Иерархия областей экспертизы. Частичное совпадение по родителю учитывается '
  'при расчёте expertise-фактора матчинга (§6.3).';

-- ---------------------------------------------------------------------------
-- Пользователи и организации
-- ---------------------------------------------------------------------------

create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null,
  status user_status not null default 'pending',
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table users is
  'Профиль поверх auth.users. Пароли и сессии остаются в схеме auth и здесь не дублируются.';

create table institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type institution_type not null,
  country_id smallint not null references countries (id) on delete restrict,
  website text,
  ror_id text,
  contact_person text,
  contact_email citext,
  contact_phone text,
  verified_at timestamptz,
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on column institutions.plan is
  'Биллинг отложен на Phase 1.5 (§11), но квоты антиабьюза считаются от плана уже в MVP.';

-- Мультитенантность: в Фазе 1 ровно одна строка с ролью owner на институцию (§2.5).
-- Таблица существует с самого начала, чтобы включение команд в Phase 1.5 не требовало
-- переписывания модели доступа.
create table institution_members (
  institution_id uuid not null references institutions (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role member_role not null default 'member',
  invited_by uuid references users (id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (institution_id, user_id)
);

create index institution_members_user_idx on institution_members (user_id);

-- ---------------------------------------------------------------------------
-- Файлы
-- ---------------------------------------------------------------------------

create table files (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users (id) on delete cascade,
  storage_key text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  scan_status file_scan_status not null default 'pending',
  created_at timestamptz not null default now()
);

comment on table files is
  'Файл публикуется только при scan_status = clean (§9). MIME проверяется по сигнатуре '
  'содержимого, а не по расширению.';

-- ---------------------------------------------------------------------------
-- Эксперты
-- ---------------------------------------------------------------------------

create table experts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  title text,
  academic_level academic_level,
  highest_degree text,

  -- Пара FK + текстовый fallback: в Фазе 1 институций десять, а экспертов двести,
  -- поэтому у большинства место работы не окажется в справочнике (§4.2).
  current_institution_id uuid references institutions (id) on delete set null,
  current_institution_name text,

  country_id smallint references countries (id) on delete restrict,
  bio text,
  photo_file_id uuid references files (id) on delete set null,
  cv_file_id uuid references files (id) on delete set null,
  orcid_id text unique,
  profile_visibility profile_visibility not null default 'authenticated',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint experts_has_institution check (
    current_institution_id is not null or current_institution_name is not null
  )
);

create index experts_country_level_idx on experts (country_id, academic_level);
create index experts_name_trgm_idx on experts using gin ((first_name || ' ' || last_name) gin_trgm_ops);

create table expert_expertise (
  expert_id uuid not null references experts (id) on delete cascade,
  expertise_id integer not null references expertise (id) on delete restrict,
  is_primary boolean not null default false,
  years_experience smallint check (years_experience >= 0),
  primary key (expert_id, expertise_id)
);

create index expert_expertise_expertise_idx on expert_expertise (expertise_id);

create table expert_languages (
  expert_id uuid not null references experts (id) on delete cascade,
  language_id smallint not null references languages (id) on delete restrict,
  -- CEFR. Матчинг засчитывает C1+ полностью, B2 частично (§6.3).
  proficiency text not null check (proficiency in ('a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'native')),
  primary key (expert_id, language_id)
);

-- ---------------------------------------------------------------------------
-- Аудит
-- ---------------------------------------------------------------------------

create table audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  reason text,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx on audit_log (actor_user_id, created_at desc);

comment on table audit_log is
  'Append-only. Действия администратора пишутся сюда обязательно (§13).';

-- ---------------------------------------------------------------------------
-- Триггеры updated_at
-- ---------------------------------------------------------------------------

create trigger users_updated_at before update on users
  for each row execute function set_updated_at();
create trigger institutions_updated_at before update on institutions
  for each row execute function set_updated_at();
create trigger experts_updated_at before update on experts
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: включаем везде. Политик нет => доступ закрыт для anon и authenticated.
-- Это намеренное состояние на конец WP2 (§8.2 deny by default).
-- ---------------------------------------------------------------------------

alter table countries enable row level security;
alter table languages enable row level security;
alter table expertise enable row level security;
alter table users enable row level security;
alter table institutions enable row level security;
alter table institution_members enable row level security;
alter table files enable row level security;
alter table experts enable row level security;
alter table expert_expertise enable row level security;
alter table expert_languages enable row level security;
alter table audit_log enable row level security;

-- Справочники читает кто угодно: они не содержат персональных данных,
-- но нужны неавторизованному пользователю на странице поиска.
create policy countries_read_all on countries for select using (true);
create policy languages_read_all on languages for select using (true);
create policy expertise_read_all on expertise for select using (true);
