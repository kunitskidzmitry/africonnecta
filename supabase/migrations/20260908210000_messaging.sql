-- Messaging + Notifications (M4). §4.7, §9, §10 docs/implementation-prompt.md.
--
-- Критерий M4: квоты и рейт-лимиты первого контакта. Email-воркер отложен
-- (ADR-0010): пишем in-app + outbox, отправка писем — Phase 1.5 / провайдер.
-- Админ не читает переписку в обычном режиме (§8.1), только reported_at.

create type public.notification_type as enum (
  'invitation_received',
  'application_received',
  'application_status_changed',
  'message_received',
  'verification_result',
  'opportunity_deadline',
  'acs_recomputed',
  'conversation_reported'
);

-- ---------------------------------------------------------------------------
-- Таблицы
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  expert_id uuid not null references public.experts (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  last_message_at timestamptz,
  reported_at timestamptz,
  reported_by uuid references public.users (id) on delete set null,
  report_reason text check (report_reason is null or char_length(report_reason) <= 2000),
  created_at timestamptz not null default now(),
  unique (institution_id, expert_id)
);

create index conversations_institution_idx on public.conversations (institution_id);
create index conversations_expert_idx on public.conversations (expert_id);
create index conversations_last_message_idx
  on public.conversations (last_message_at desc nulls last, id desc);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_participants_user_idx
  on public.conversation_participants (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_user_id uuid not null references public.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at asc, id asc);

-- Журнал первых контактов: квота N/сутки на институцию и M на пользователя (§9).
create table public.first_contacts (
  id bigint generated always as identity primary key,
  institution_id uuid not null references public.institutions (id) on delete cascade,
  expert_id uuid not null references public.experts (id) on delete cascade,
  opened_by uuid not null references public.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (institution_id, expert_id)
);

create index first_contacts_institution_day_idx
  on public.first_contacts (institution_id, created_at desc);
create index first_contacts_opened_by_day_idx
  on public.first_contacts (opened_by, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type public.notification_type not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;
create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- Очередь писем: идемпотентный ключ (§10). Воркер отправки — отдельно (ADR-0010).
create table public.notification_email_outbox (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.notifications (id) on delete cascade,
  to_email citext not null,
  subject text not null,
  body text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);

create index notification_email_outbox_pending_idx
  on public.notification_email_outbox (created_at)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Хелперы
-- ---------------------------------------------------------------------------

create or replace function public.is_conversation_participant(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_participants p
    where p.conversation_id = target_conversation_id
      and p.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_read_conversation(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = target_conversation_id
      and (
        public.is_conversation_participant(c.id)
        or public.is_owner_of(c.institution_id)
        -- Админ читает только жалобы (§8.1).
        or (public.is_admin() and c.reported_at is not null)
      )
  );
$$;

create or replace function public.notify_user(
  target_user_id uuid,
  ntype public.notification_type,
  npayload jsonb,
  email_subject text default null,
  email_body text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  nid uuid;
  dest text;
  idem text;
begin
  insert into public.notifications (user_id, type, payload)
  values (target_user_id, ntype, coalesce(npayload, '{}'::jsonb))
  returning id into nid;

  if email_subject is not null and email_body is not null then
    select u.email into dest from auth.users u where u.id = target_user_id;
    if dest is not null then
      idem := ntype::text || ':' || nid::text;
      insert into public.notification_email_outbox (
        notification_id, to_email, subject, body, idempotency_key
      ) values (nid, dest, email_subject, email_body, idem)
      on conflict (idempotency_key) do nothing;
    end if;
  end if;

  return nid;
end;
$$;

revoke all on function public.notify_user(uuid, public.notification_type, jsonb, text, text) from public;
-- Только внутренние триггеры/RPC; клиент не зовёт напрямую.

-- ---------------------------------------------------------------------------
-- Старт разговора (первый контакт + квота)
-- ---------------------------------------------------------------------------

create or replace function public.start_conversation(
  target_expert_id uuid,
  initial_body text,
  related_opportunity_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role public.user_role := public.current_user_role();
  expert record;
  target_institution_id uuid;
  institution_verified timestamptz;
  institution_plan text;
  daily_limit smallint;
  used_institution integer;
  used_user integer;
  existing_id uuid;
  new_id uuid;
  expert_user uuid;
  body_trim text := trim(initial_body);
  is_first boolean := false;
begin
  if caller is null or caller_role is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if body_trim is null or char_length(body_trim) < 1 or char_length(body_trim) > 5000 then
    raise exception 'Message body invalid' using errcode = '22000';
  end if;

  select e.id, e.user_id, e.published_at, e.profile_visibility, e.deleted_at
  into expert
  from public.experts e
  where e.id = target_expert_id;

  if expert.id is null or expert.deleted_at is not null then
    raise exception 'Expert not found' using errcode = '42501';
  end if;

  expert_user := expert.user_id;

  if caller_role = 'institution_member' then
    target_institution_id := public.current_institution_id();
    if target_institution_id is null then
      raise exception 'Not allowed' using errcode = '42501';
    end if;

    select i.verified_at, i.plan into institution_verified, institution_plan
    from public.institutions i where i.id = target_institution_id;

    if institution_verified is null then
      raise exception 'Institution is not verified yet' using errcode = 'AF002';
    end if;

    if expert.published_at is null or expert.profile_visibility = 'hidden' then
      raise exception 'Expert not found' using errcode = '42501';
    end if;

  elsif caller_role = 'expert' then
    if expert.user_id is distinct from caller then
      raise exception 'Expert may only message about own profile context' using errcode = '42501';
    end if;

    if related_opportunity_id is null then
      raise exception 'Expert first contact requires a published opportunity' using errcode = '22000';
    end if;

    select o.institution_id into target_institution_id
    from public.opportunities o
    where o.id = related_opportunity_id and o.status = 'published';

    if target_institution_id is null then
      raise exception 'Opportunity not available' using errcode = '42501';
    end if;

    select i.plan into institution_plan from public.institutions i where i.id = target_institution_id;

  else
    raise exception 'Not allowed to start conversations' using errcode = '42501';
  end if;

  select c.id into existing_id
  from public.conversations c
  where c.institution_id = target_institution_id and c.expert_id = target_expert_id;

  if existing_id is not null then
    perform public.send_message(existing_id, body_trim);
    return existing_id;
  end if;

  -- Новый разговор = первый контакт. Квоту тратит только институция (§9).
  if caller_role = 'institution_member' then
    perform pg_advisory_xact_lock(
      hashtext('first_contacts'),
      hashtext(target_institution_id::text)
    );

    select pl.first_contacts_per_day into daily_limit
    from public.plan_limits pl where pl.plan = institution_plan;

    if daily_limit is null then
      daily_limit := 0;
    end if;

    select count(*)::integer into used_institution
    from public.first_contacts fc
    where fc.institution_id = target_institution_id
      and fc.created_at > now() - interval '1 day';

    if used_institution >= daily_limit then
      raise exception 'First-contact quota exceeded for institution'
        using errcode = 'AF003';
    end if;

    select count(*)::integer into used_user
    from public.first_contacts fc
    where fc.opened_by = caller
      and fc.created_at > now() - interval '1 day';

    -- M на пользователя: тот же лимит тарифа (ADR-0010), пока нет отдельной колонки.
    if used_user >= daily_limit then
      raise exception 'First-contact quota exceeded for user'
        using errcode = 'AF004';
    end if;

    is_first := true;
  end if;

  insert into public.conversations (institution_id, expert_id, opportunity_id, last_message_at)
  values (target_institution_id, target_expert_id, related_opportunity_id, now())
  returning id into new_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values
    (new_id, caller),
    (new_id, expert_user)
  on conflict do nothing;

  -- Владельцы институции тоже участники, чтобы «owner видит все» работал и у member-потока.
  insert into public.conversation_participants (conversation_id, user_id)
  select new_id, m.user_id
  from public.institution_members m
  where m.institution_id = target_institution_id
  on conflict do nothing;

  if is_first then
    insert into public.first_contacts (
      institution_id, expert_id, opened_by, conversation_id
    ) values (target_institution_id, target_expert_id, caller, new_id);
  end if;

  -- Дальше тот же путь, что и для существующего разговора: сообщение + уведомления.
  perform public.send_message(new_id, body_trim);

  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Отправка сообщения в существующий разговор
-- ---------------------------------------------------------------------------

create or replace function public.send_message(
  target_conversation_id uuid,
  message_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  body_trim text := trim(message_body);
  mid uuid;
  conv record;
  recipient uuid;
begin
  if caller is null or public.current_user_role() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if body_trim is null or char_length(body_trim) < 1 or char_length(body_trim) > 5000 then
    raise exception 'Message body invalid' using errcode = '22000';
  end if;

  if not public.is_conversation_participant(target_conversation_id)
     and not public.is_owner_of((
       select c.institution_id from public.conversations c where c.id = target_conversation_id
     )) then
    raise exception 'Not a participant' using errcode = '42501';
  end if;

  -- Владелец, ещё не в participants — добавляем при ответе.
  insert into public.conversation_participants (conversation_id, user_id)
  values (target_conversation_id, caller)
  on conflict do nothing;

  insert into public.messages (conversation_id, sender_user_id, body)
  values (target_conversation_id, caller, body_trim)
  returning id into mid;

  update public.conversations
  set last_message_at = now()
  where id = target_conversation_id;

  select c.institution_id, c.expert_id into conv
  from public.conversations c where c.id = target_conversation_id;

  -- Уведомление всем участникам, кроме отправителя.
  for recipient in
    select p.user_id
    from public.conversation_participants p
    where p.conversation_id = target_conversation_id
      and p.user_id is distinct from caller
  loop
    perform public.notify_user(
      recipient,
      'message_received',
      jsonb_build_object(
        'conversation_id', target_conversation_id,
        'message_id', mid
      ),
      'New message on AfriConnecta',
      'You have a new message. Open AfriConnecta to reply.'
    );
  end loop;

  return mid;
end;
$$;

-- start_conversation вызывает send_message для существующего — forward declare order:
-- send_message defined above; start_conversation already references it. OK in PG.

create or replace function public.report_conversation(
  target_conversation_id uuid,
  reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  reason_trim text := trim(reason);
begin
  if caller is null or public.current_user_role() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not public.is_conversation_participant(target_conversation_id) then
    raise exception 'Not a participant' using errcode = '42501';
  end if;

  if reason_trim is null or char_length(reason_trim) < 1 then
    raise exception 'Report reason required' using errcode = '22000';
  end if;

  update public.conversations
  set
    reported_at = coalesce(reported_at, now()),
    reported_by = caller,
    report_reason = left(reason_trim, 2000)
  where id = target_conversation_id;

  insert into public.audit_log (actor_user_id, action, entity_type, entity_id, reason)
  values (caller, 'conversation.report', 'conversation', target_conversation_id::text, reason_trim);
end;
$$;

create or replace function public.mark_notifications_read(notification_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  n integer;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if notification_ids is null then
    update public.notifications
    set read_at = now()
    where user_id = caller and read_at is null;
  else
    update public.notifications
    set read_at = now()
    where user_id = caller
      and read_at is null
      and id = any (notification_ids);
  end if;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- Уведомления по заявкам / приглашениям (M3 → M4).
create or replace function public.notify_on_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  opp record;
  member record;
  expert_user uuid;
begin
  select o.id, o.title, o.institution_id into opp
  from public.opportunities o where o.id = new.opportunity_id;

  select e.user_id into expert_user from public.experts e where e.id = new.expert_id;

  if tg_op = 'INSERT' then
    for member in
      select m.user_id from public.institution_members m where m.institution_id = opp.institution_id
    loop
      perform public.notify_user(
        member.user_id,
        'application_received',
        jsonb_build_object(
          'application_id', new.id,
          'opportunity_id', opp.id,
          'opportunity_title', opp.title
        ),
        'New application on AfriConnecta',
        'Someone applied to «' || opp.title || '».'
      );
    end loop;
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    if expert_user is not null then
      perform public.notify_user(
        expert_user,
        'application_status_changed',
        jsonb_build_object(
          'application_id', new.id,
          'opportunity_id', opp.id,
          'status', new.status
        ),
        'Application update on AfriConnecta',
        'Your application status is now: ' || new.status::text || '.'
      );
    end if;
  end if;

  return new;
end;
$$;

create trigger applications_notify
  after insert or update of status on public.applications
  for each row execute function public.notify_on_application();

create or replace function public.notify_on_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expert_user uuid;
begin
  if tg_op = 'INSERT' then
    select e.user_id into expert_user from public.experts e where e.id = new.expert_id;
    if expert_user is not null then
      perform public.notify_user(
        expert_user,
        'invitation_received',
        jsonb_build_object(
          'invitation_id', new.id,
          'institution_id', new.institution_id,
          'opportunity_id', new.opportunity_id
        ),
        'Invitation on AfriConnecta',
        'An institution invited you. Open AfriConnecta to respond.'
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger invitations_notify
  after insert on public.invitations
  for each row execute function public.notify_on_invitation();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.first_contacts enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_email_outbox enable row level security;

create policy conversations_select on public.conversations
  for select
  to authenticated
  using (
    public.is_conversation_participant(id)
    or public.is_owner_of(institution_id)
    or ((select public.is_admin()) and reported_at is not null)
  );

-- Пишет только RPC (security definer). Политик insert/update для клиентов нет,
-- кроме report через RPC.

create policy conversation_participants_select on public.conversation_participants
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.can_read_conversation(conversation_id)
  );

create policy conversation_participants_update_own on public.conversation_participants
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy messages_select on public.messages
  for select
  to authenticated
  using (public.can_read_conversation(conversation_id));

-- Insert сообщений только через send_message / start_conversation.

create policy first_contacts_select on public.first_contacts
  for select
  to authenticated
  using (
    public.is_member_of(institution_id)
    or opened_by = (select auth.uid())
    or (select public.is_admin())
  );

create policy notifications_select_own on public.notifications
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update_own on public.notifications
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Outbox клиенту не виден (deny by default). Админ — для отладки.
create policy notification_email_outbox_select_admin on public.notification_email_outbox
  for select
  to authenticated
  using ((select public.is_admin()));

revoke all on function public.start_conversation(uuid, text, uuid) from public;
revoke all on function public.send_message(uuid, text) from public;
revoke all on function public.report_conversation(uuid, text) from public;
revoke all on function public.mark_notifications_read(uuid[]) from public;
revoke all on function public.is_conversation_participant(uuid) from public;
revoke all on function public.can_read_conversation(uuid) from public;

grant execute on function public.start_conversation(uuid, text, uuid) to authenticated;
grant execute on function public.send_message(uuid, text) to authenticated;
grant execute on function public.report_conversation(uuid, text) to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.is_conversation_participant(uuid) to authenticated;
grant execute on function public.can_read_conversation(uuid) to authenticated;

comment on table public.conversations is
  'Messaging §9 / M4. Админ читает только при reported_at (§8.1).';
comment on table public.first_contacts is
  'Журнал первых контактов для квоты plan_limits.first_contacts_per_day.';
comment on table public.notification_email_outbox is
  'Очередь писем §10. Воркер отправки отложен — ADR-0010.';
