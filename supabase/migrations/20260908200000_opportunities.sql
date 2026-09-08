-- Opportunity Board (M3). Соответствует §4.6 docs/implementation-prompt.md.
--
-- Цикл: вакансия → заявка/приглашение → engagement.
-- Матчинг (§6, GET /matches) — M5, здесь таблиц match_runs нет.
--
-- Отступление от черновика §4.6: opportunity_requirements.ref_id заменён на
-- ref_value text — у academic_level нет числового id. См. ADR-0009.

-- ---------------------------------------------------------------------------
-- Перечисления
-- ---------------------------------------------------------------------------

create type public.opportunity_type as enum (
  'lectureship',
  'supervision',
  'research',
  'mentorship',
  'consulting',
  'conference',
  'other'
);

create type public.opportunity_mode as enum ('online', 'hybrid', 'onsite');

create type public.opportunity_status as enum ('draft', 'published', 'closed');

create type public.application_status as enum (
  'submitted',
  'under_review',
  'shortlisted',
  'accepted',
  'rejected',
  'withdrawn'
);

create type public.invitation_status as enum (
  'pending',
  'accepted',
  'declined',
  'expired',
  'cancelled'
);

create type public.engagement_source as enum ('application', 'invitation');

create type public.requirement_kind as enum (
  'expertise',
  'language',
  'academic_level',
  'country'
);

-- ---------------------------------------------------------------------------
-- Таблицы
-- ---------------------------------------------------------------------------

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  created_by uuid not null references public.users (id) on delete restrict,
  title text not null check (char_length(title) between 1 and 200),
  description text not null check (char_length(description) between 1 and 10000),
  type public.opportunity_type not null,
  mode public.opportunity_mode not null,
  country_id smallint references public.countries (id) on delete restrict,
  location text,
  compensation_amount numeric(12, 2) check (compensation_amount is null or compensation_amount >= 0),
  compensation_currency char(3),
  duration text,
  deadline timestamptz,
  status public.opportunity_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunities_published_consistency check (
    (status = 'draft' and published_at is null)
    or (status in ('published', 'closed') and published_at is not null)
  ),
  constraint opportunities_compensation_currency check (
    (compensation_amount is null and compensation_currency is null)
    or (compensation_amount is not null and compensation_currency is not null)
  )
);

create index opportunities_institution_idx on public.opportunities (institution_id);
create index opportunities_created_by_idx on public.opportunities (created_by);
create index opportunities_country_idx on public.opportunities (country_id);
-- Ключсет-пагинация доски: свежие опубликованные сверху.
create index opportunities_published_board_idx
  on public.opportunities (published_at desc, id desc)
  where status = 'published';

create trigger opportunities_updated_at before update on public.opportunities
  for each row execute function public.set_updated_at();

create table public.opportunity_requirements (
  id bigint generated always as identity primary key,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  kind public.requirement_kind not null,
  -- expertise/language/country: строковый id; academic_level: значение enum.
  ref_value text not null,
  is_mandatory boolean not null default true,
  unique (opportunity_id, kind, ref_value)
);

create index opportunity_requirements_opportunity_idx
  on public.opportunity_requirements (opportunity_id);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  expert_id uuid not null references public.experts (id) on delete cascade,
  status public.application_status not null default 'submitted',
  cover_letter text check (cover_letter is null or char_length(cover_letter) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, expert_id)
);

create index applications_opportunity_idx on public.applications (opportunity_id);
create index applications_expert_idx on public.applications (expert_id);

create trigger applications_updated_at before update on public.applications
  for each row execute function public.set_updated_at();

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  expert_id uuid not null references public.experts (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  message text check (message is null or char_length(message) <= 2000),
  status public.invitation_status not null default 'pending',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invitations_institution_idx on public.invitations (institution_id);
create index invitations_expert_idx on public.invitations (expert_id);
create index invitations_opportunity_idx on public.invitations (opportunity_id);

create trigger invitations_updated_at before update on public.invitations
  for each row execute function public.set_updated_at();

-- Основание для «Collaborations Facilitated» и будущих отзывов (§4.6).
create table public.engagements (
  id uuid primary key default gen_random_uuid(),
  expert_id uuid not null references public.experts (id) on delete cascade,
  institution_id uuid not null references public.institutions (id) on delete cascade,
  source_type public.engagement_source not null,
  source_id uuid not null,
  confirmed_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create index engagements_expert_idx on public.engagements (expert_id);
create index engagements_institution_idx on public.engagements (institution_id);

create table public.saved_experts (
  institution_id uuid not null references public.institutions (id) on delete cascade,
  expert_id uuid not null references public.experts (id) on delete cascade,
  saved_by uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (institution_id, expert_id)
);

create index saved_experts_expert_idx on public.saved_experts (expert_id);
create index saved_experts_saved_by_idx on public.saved_experts (saved_by);

-- ---------------------------------------------------------------------------
-- Engagement: только из принятой заявки или приглашения
--
-- Прямой insert клиенту закрыт. Триггеры пишут строку при переходе в accepted.
-- Смена статуса заявки — только человеком (§7), автомат здесь лишь фиксирует факт.
-- ---------------------------------------------------------------------------

create or replace function public.engagement_from_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  opp public.opportunities%rowtype;
begin
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    select * into opp from public.opportunities where id = new.opportunity_id;
    if not found then
      raise exception 'opportunity missing for application %', new.id;
    end if;

    insert into public.engagements (expert_id, institution_id, source_type, source_id)
    values (new.expert_id, opp.institution_id, 'application', new.id)
    on conflict (source_type, source_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger applications_create_engagement
  after insert or update of status on public.applications
  for each row execute function public.engagement_from_application();

create or replace function public.engagement_from_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    insert into public.engagements (expert_id, institution_id, source_type, source_id)
    values (new.expert_id, new.institution_id, 'invitation', new.id)
    on conflict (source_type, source_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger invitations_create_engagement
  after insert or update of status on public.invitations
  for each row execute function public.engagement_from_invitation();

-- Заявка только на опубликованную вакансию, и только своим expert_id.
create or replace function public.applications_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  opp_status public.opportunity_status;
  owner uuid;
begin
  select o.status into opp_status
  from public.opportunities o
  where o.id = new.opportunity_id;

  if opp_status is distinct from 'published' then
    raise exception 'applications only on published opportunities';
  end if;

  select e.user_id into owner
  from public.experts e
  where e.id = new.expert_id;

  if owner is distinct from (select auth.uid()) and not public.is_admin() then
    raise exception 'cannot apply as another expert';
  end if;

  return new;
end;
$$;

create trigger applications_guard_insert
  before insert on public.applications
  for each row execute function public.applications_guard_insert();

-- Эксперт сам себя не принимает: institution меняет статус, эксперт — только withdrawn.
create or replace function public.applications_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  opp_institution uuid;
  owner uuid;
begin
  if old.opportunity_id is distinct from new.opportunity_id
     or old.expert_id is distinct from new.expert_id then
    raise exception 'application identity is immutable';
  end if;

  select o.institution_id into opp_institution
  from public.opportunities o
  where o.id = new.opportunity_id;

  select e.user_id into owner
  from public.experts e
  where e.id = new.expert_id;

  if public.is_admin() then
    return new;
  end if;

  if public.is_member_of(opp_institution) then
    if new.status = 'withdrawn' and old.status is distinct from 'withdrawn' then
      raise exception 'institution cannot withdraw an application';
    end if;
    return new;
  end if;

  if owner = (select auth.uid()) then
    if new.status is distinct from 'withdrawn' or old.status = 'withdrawn' then
      raise exception 'expert may only withdraw own application';
    end if;
    if old.status in ('accepted', 'rejected') then
      raise exception 'cannot withdraw a decided application';
    end if;
    return new;
  end if;

  raise exception 'not allowed to update application';
end;
$$;

create trigger applications_guard_update
  before update on public.applications
  for each row execute function public.applications_guard_update();

create or replace function public.invitations_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() and not public.is_member_of(new.institution_id) then
    raise exception 'only institution members may invite';
  end if;

  if new.opportunity_id is not null then
    if not exists (
      select 1 from public.opportunities o
      where o.id = new.opportunity_id
        and o.institution_id = new.institution_id
    ) then
      raise exception 'invitation opportunity must belong to institution';
    end if;
  end if;

  return new;
end;
$$;

create trigger invitations_guard_insert
  before insert on public.invitations
  for each row execute function public.invitations_guard_insert();

create or replace function public.invitations_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  if old.institution_id is distinct from new.institution_id
     or old.expert_id is distinct from new.expert_id
     or old.opportunity_id is distinct from new.opportunity_id then
    raise exception 'invitation identity is immutable';
  end if;

  select e.user_id into owner
  from public.experts e
  where e.id = new.expert_id;

  if public.is_admin() then
    return new;
  end if;

  if public.is_member_of(old.institution_id) then
    if new.status not in ('cancelled', 'expired') then
      raise exception 'institution may only cancel or expire invitations';
    end if;
    return new;
  end if;

  if owner = (select auth.uid()) then
    if old.status is distinct from 'pending' then
      raise exception 'invitation is no longer pending';
    end if;
    if new.status not in ('accepted', 'declined') then
      raise exception 'expert may only accept or decline';
    end if;
    if old.expires_at is not null and old.expires_at < now() then
      raise exception 'invitation expired';
    end if;
    return new;
  end if;

  raise exception 'not allowed to update invitation';
end;
$$;

create trigger invitations_guard_update
  before update on public.invitations
  for each row execute function public.invitations_guard_update();

-- Публикация: draft → published выставляет published_at.
create or replace function public.opportunities_guard_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'published' and new.published_at is null then
      new.published_at := now();
    end if;
    -- Сид и миграции идут без JWT: auth.uid() пустой, проверку пропускаем.
    if (select auth.uid()) is not null
       and new.created_by is distinct from (select auth.uid())
       and not public.is_admin() then
      raise exception 'created_by must be the current user';
    end if;
    return new;
  end if;

  if old.institution_id is distinct from new.institution_id then
    raise exception 'institution_id is immutable';
  end if;

  if old.status = 'draft' and new.status = 'published' then
    new.published_at := coalesce(new.published_at, now());
  end if;

  if old.status = 'published' and new.status = 'draft' then
    raise exception 'cannot unpublish; close instead';
  end if;

  return new;
end;
$$;

create trigger opportunities_guard_status
  before insert or update on public.opportunities
  for each row execute function public.opportunities_guard_status();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.opportunities enable row level security;
alter table public.opportunity_requirements enable row level security;
alter table public.applications enable row level security;
alter table public.invitations enable row level security;
alter table public.engagements enable row level security;
alter table public.saved_experts enable row level security;

-- Гость и все видят только опубликованные. Члены институции и админ — свои/все.
create policy opportunities_select_published on public.opportunities
  for select
  using (
    status = 'published'
    or public.is_member_of(institution_id)
    or (select public.is_admin())
  );

create policy opportunities_insert_member on public.opportunities
  for insert
  to authenticated
  with check (
    (
      public.is_member_of(institution_id)
      and created_by = (select auth.uid())
      and (select public.current_user_role()) is not null
    )
    or (select public.is_admin())
  );

create policy opportunities_update_member on public.opportunities
  for update
  to authenticated
  using (
    public.is_member_of(institution_id)
    or (select public.is_admin())
  )
  with check (
    public.is_member_of(institution_id)
    or (select public.is_admin())
  );

create policy opportunities_delete_member on public.opportunities
  for delete
  to authenticated
  using (
    (public.is_member_of(institution_id) and status = 'draft')
    or (select public.is_admin())
  );

-- Требования повторяют видимость вакансии.
create policy opportunity_requirements_select on public.opportunity_requirements
  for select
  using (
    exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id
    )
  );

create policy opportunity_requirements_write on public.opportunity_requirements
  for all
  to authenticated
  using (
    exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id
        and (public.is_member_of(o.institution_id) or (select public.is_admin()))
    )
  )
  with check (
    exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id
        and (public.is_member_of(o.institution_id) or (select public.is_admin()))
    )
  );

-- Заявки: эксперт — свои; институция — по своим вакансиям; админ — все.
create policy applications_select on public.applications
  for select
  using (
    exists (
      select 1 from public.experts e
      where e.id = expert_id and e.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id
        and public.is_member_of(o.institution_id)
    )
    or (select public.is_admin())
  );

create policy applications_insert_own on public.applications
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.experts e
      where e.id = expert_id
        and e.user_id = (select auth.uid())
        and (select public.current_user_role()) is not null
    )
  );

create policy applications_update on public.applications
  for update
  to authenticated
  using (
    exists (
      select 1 from public.experts e
      where e.id = expert_id and e.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id
        and public.is_member_of(o.institution_id)
    )
    or (select public.is_admin())
  )
  with check (
    exists (
      select 1 from public.experts e
      where e.id = expert_id and e.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id
        and public.is_member_of(o.institution_id)
    )
    or (select public.is_admin())
  );

create policy invitations_select on public.invitations
  for select
  using (
    exists (
      select 1 from public.experts e
      where e.id = expert_id and e.user_id = (select auth.uid())
    )
    or public.is_member_of(institution_id)
    or (select public.is_admin())
  );

create policy invitations_insert_member on public.invitations
  for insert
  to authenticated
  with check (
    public.is_member_of(institution_id)
    or (select public.is_admin())
  );

create policy invitations_update on public.invitations
  for update
  to authenticated
  using (
    exists (
      select 1 from public.experts e
      where e.id = expert_id and e.user_id = (select auth.uid())
    )
    or public.is_member_of(institution_id)
    or (select public.is_admin())
  )
  with check (
    exists (
      select 1 from public.experts e
      where e.id = expert_id and e.user_id = (select auth.uid())
    )
    or public.is_member_of(institution_id)
    or (select public.is_admin())
  );

create policy engagements_select on public.engagements
  for select
  using (
    exists (
      select 1 from public.experts e
      where e.id = expert_id and e.user_id = (select auth.uid())
    )
    or public.is_member_of(institution_id)
    or (select public.is_admin())
  );

-- Пишет только триггер (security definer). Политик insert для клиентов нет.

create policy saved_experts_select on public.saved_experts
  for select
  using (
    public.is_member_of(institution_id)
    or (select public.is_admin())
  );

create policy saved_experts_insert on public.saved_experts
  for insert
  to authenticated
  with check (
    public.is_member_of(institution_id)
    and saved_by = (select auth.uid())
  );

create policy saved_experts_delete on public.saved_experts
  for delete
  to authenticated
  using (
    public.is_member_of(institution_id)
    or (select public.is_admin())
  );

comment on table public.opportunities is
  'Opportunity Board §4.6 / M3. Списочный ответ не содержит контактов экспертов.';
comment on table public.engagements is
  'Состоявшееся взаимодействие. Пишется триггером при accept заявки или приглашения.';
