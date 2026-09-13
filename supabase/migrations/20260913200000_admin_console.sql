-- M6 Admin Console: suspend/unsuspend, search_events, empty-search metric.
-- §2.5 / §10 / §13 docs/implementation-prompt.md. ADR-0012.

-- ---------------------------------------------------------------------------
-- Search events (cold-start metric §10)
-- ---------------------------------------------------------------------------

create table public.search_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users (id) on delete set null,
  query jsonb not null default '{}'::jsonb,
  mode text not null check (mode in ('exact', 'broadened', 'similar')),
  exact_count integer not null check (exact_count >= 0),
  final_count integer not null check (final_count >= 0),
  created_at timestamptz not null default now()
);

create index search_events_created_idx on public.search_events (created_at desc);

alter table public.search_events enable row level security;

-- Append-only: guests and signed-in users may record a search; nobody updates/deletes.
create policy search_events_insert on public.search_events
  for insert to anon, authenticated
  with check (
    actor_user_id is null
    or actor_user_id = (select auth.uid())
  );

create policy search_events_select_admin on public.search_events
  for select to authenticated
  using ((select public.is_admin()));

revoke all on table public.search_events from public;
grant insert on table public.search_events to anon, authenticated;
grant select on table public.search_events to authenticated;

comment on table public.search_events is
  'First-page search journal for empty-result rate §10 / M6. No PII beyond filters.';

-- ---------------------------------------------------------------------------
-- Admin: set user status (suspend / unsuspend)
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_user_status(
  target_user_id uuid,
  new_status public.user_status,
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
  target record;
begin
  if caller is null or not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  if reason_trim is null or char_length(reason_trim) < 1 then
    raise exception 'Reason required' using errcode = '22000';
  end if;

  if new_status is distinct from 'active' and new_status is distinct from 'suspended' then
    raise exception 'Status must be active or suspended' using errcode = '22000';
  end if;

  if target_user_id = caller then
    raise exception 'Cannot change own status' using errcode = '42501';
  end if;

  select id, role, status into target
  from public.users
  where id = target_user_id
  for update;

  if target.id is null then
    raise exception 'User not found' using errcode = '42501';
  end if;

  if target.role = 'admin' then
    raise exception 'Cannot change admin status' using errcode = '42501';
  end if;

  if target.status = new_status then
    return;
  end if;

  update public.users
  set status = new_status
  where id = target_user_id;

  insert into public.audit_log (actor_user_id, action, entity_type, entity_id, reason)
  values (
    caller,
    case when new_status = 'suspended' then 'user.suspend' else 'user.unsuspend' end,
    'user',
    target_user_id::text,
    reason_trim
  );
end;
$$;

revoke all on function public.admin_set_user_status(uuid, public.user_status, text)
  from public, anon;
grant execute on function public.admin_set_user_status(uuid, public.user_status, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Empty-search rates for admin dashboard
-- ---------------------------------------------------------------------------

create or replace function public.admin_search_empty_rates(p_window_days integer default 30)
returns table (
  window_days integer,
  total_searches bigint,
  exact_empty_count bigint,
  final_empty_count bigint,
  exact_empty_rate numeric,
  final_empty_rate numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  days integer := greatest(coalesce(p_window_days, 30), 1);
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  return query
  select
    days,
    count(*)::bigint,
    count(*) filter (where e.exact_count = 0)::bigint,
    count(*) filter (where e.final_count = 0)::bigint,
    case
      when count(*) = 0 then null
      else round(
        (count(*) filter (where e.exact_count = 0))::numeric / count(*)::numeric,
        4
      )
    end,
    case
      when count(*) = 0 then null
      else round(
        (count(*) filter (where e.final_count = 0))::numeric / count(*)::numeric,
        4
      )
    end
  from public.search_events e
  where e.created_at >= now() - make_interval(days => days);
end;
$$;

revoke all on function public.admin_search_empty_rates(integer) from public, anon;
grant execute on function public.admin_search_empty_rates(integer) to authenticated;

create or replace function public.admin_list_user_emails(target_ids uuid[])
returns table (id uuid, email text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  return query
  select u.id, u.email::text
  from auth.users u
  where u.id = any (target_ids);
end;
$$;

revoke all on function public.admin_list_user_emails(uuid[]) from public, anon;
grant execute on function public.admin_list_user_emails(uuid[]) to authenticated;

comment on function public.admin_set_user_status is
  'M6: admin suspend/unsuspend with audit_log reason. No self or peer-admin changes.';
comment on function public.admin_search_empty_rates is
  'M6: cold-start metric §10 — share of first-page searches with empty exact/final results.';
comment on function public.admin_list_user_emails is
  'M6: admin-only email lookup for console user list (auth.users).';
