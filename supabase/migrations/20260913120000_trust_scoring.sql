-- M5 Trust: ACS inputs, african_context_scores, match_runs, verification queue.
-- §4.4–4.5, §4.7, §5, §6, §11 docs/implementation-prompt.md. ADR-0011.

-- ---------------------------------------------------------------------------
-- Содержание профиля (входы ACS / availability)
-- ---------------------------------------------------------------------------

create type public.experience_type as enum (
  'academic',
  'policy',
  'development',
  'industry'
);

create type public.availability_mode as enum ('online', 'hybrid', 'onsite');

create type public.availability_role as enum (
  'guest_lecturer',
  'research_partner',
  'mentor',
  'conference_speaker',
  'consultant',
  'thesis_supervisor'
);

create table public.education (
  id uuid primary key default gen_random_uuid(),
  expert_id uuid not null references public.experts (id) on delete cascade,
  degree text not null check (char_length(degree) between 1 and 200),
  institution_name text not null check (char_length(institution_name) between 1 and 300),
  field text check (field is null or char_length(field) <= 200),
  year_start smallint check (year_start is null or year_start between 1950 and 2100),
  year_end smallint check (year_end is null or year_end between 1950 and 2100),
  created_at timestamptz not null default now()
);

create index education_expert_idx on public.education (expert_id);

create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  expert_id uuid not null references public.experts (id) on delete cascade,
  organization text not null check (char_length(organization) between 1 and 300),
  role text not null check (char_length(role) between 1 and 200),
  country_id smallint references public.countries (id) on delete set null,
  type public.experience_type not null,
  started_on date,
  ended_on date,
  created_at timestamptz not null default now(),
  check (ended_on is null or started_on is null or ended_on >= started_on)
);

create index experiences_expert_idx on public.experiences (expert_id);
create index experiences_type_idx on public.experiences (expert_id, type);

create table public.expert_availability (
  expert_id uuid not null references public.experts (id) on delete cascade,
  mode public.availability_mode not null,
  role public.availability_role not null,
  primary key (expert_id, mode, role)
);

-- ---------------------------------------------------------------------------
-- ACS (append-only)
-- ---------------------------------------------------------------------------

create table public.african_context_scores (
  id uuid primary key default gen_random_uuid(),
  expert_id uuid not null references public.experts (id) on delete cascade,
  algorithm_version text not null,
  total numeric(5, 2) not null check (total >= 0 and total <= 100),
  components jsonb not null,
  inputs_hash text not null,
  computed_at timestamptz not null default now(),
  computed_by uuid references public.users (id) on delete set null
);

create index african_context_scores_expert_computed_idx
  on public.african_context_scores (expert_id, computed_at desc);

create table public.acs_disputes (
  id uuid primary key default gen_random_uuid(),
  expert_id uuid not null references public.experts (id) on delete cascade,
  score_id uuid not null references public.african_context_scores (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 2000),
  status text not null default 'open'
    check (status in ('open', 'resolved', 'rejected')),
  created_by uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolver_note text
);

create index acs_disputes_expert_idx on public.acs_disputes (expert_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Matching journal (§2.4 / §6)
-- ---------------------------------------------------------------------------

create table public.match_runs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.users (id) on delete cascade,
  institution_id uuid not null references public.institutions (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  query jsonb not null default '{}'::jsonb,
  algorithm_version text not null,
  created_at timestamptz not null default now()
);

create index match_runs_institution_idx on public.match_runs (institution_id, created_at desc);
create index match_runs_opportunity_idx on public.match_runs (opportunity_id, created_at desc);

create table public.match_results (
  match_run_id uuid not null references public.match_runs (id) on delete cascade,
  expert_id uuid not null references public.experts (id) on delete cascade,
  rank integer not null check (rank >= 1),
  total_score numeric(5, 4) not null check (total_score >= 0 and total_score <= 1),
  factors jsonb not null,
  primary key (match_run_id, expert_id)
);

create index match_results_run_rank_idx on public.match_results (match_run_id, rank);

-- ---------------------------------------------------------------------------
-- Verification queue (§11 Phase 1: domain + manual; ORCID → Phase 1.5)
-- ---------------------------------------------------------------------------

create type public.verification_subject as enum (
  'institution',
  'expert_affiliation'
);

create type public.verification_status as enum (
  'pending',
  'approved',
  'rejected'
);

create type public.verification_method as enum (
  'domain_email',
  'manual'
);

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  subject_type public.verification_subject not null,
  subject_id uuid not null,
  requested_by uuid not null references public.users (id) on delete cascade,
  method public.verification_method not null,
  status public.verification_status not null default 'pending',
  evidence jsonb not null default '{}'::jsonb,
  decided_by uuid references public.users (id) on delete set null,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now()
);

create index verification_requests_status_idx
  on public.verification_requests (status, created_at asc)
  where status = 'pending';
create index verification_requests_subject_idx
  on public.verification_requests (subject_type, subject_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers / RPCs
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_institution_verified(
  target_institution_id uuid,
  approve boolean,
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
  if caller is null or not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  if reason_trim is null or char_length(reason_trim) < 1 then
    raise exception 'Reason required' using errcode = '22000';
  end if;

  if approve then
    update public.institutions
    set verified_at = coalesce(verified_at, now())
    where id = target_institution_id and deleted_at is null;
  else
    update public.institutions
    set verified_at = null
    where id = target_institution_id and deleted_at is null;
  end if;

  if not found then
    raise exception 'Institution not found' using errcode = '42501';
  end if;

  insert into public.audit_log (actor_user_id, action, entity_type, entity_id, reason)
  values (
    caller,
    case when approve then 'institution.verify' else 'institution.unverify' end,
    'institution',
    target_institution_id::text,
    reason_trim
  );
end;
$$;

create or replace function public.decide_verification_request(
  request_id uuid,
  approve boolean,
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
  req record;
  expert_user uuid;
begin
  if caller is null or not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  if reason_trim is null or char_length(reason_trim) < 1 then
    raise exception 'Reason required' using errcode = '22000';
  end if;

  select * into req from public.verification_requests where id = request_id for update;
  if req.id is null then
    raise exception 'Request not found' using errcode = '42501';
  end if;
  if req.status is distinct from 'pending' then
    raise exception 'Request already decided' using errcode = '22000';
  end if;

  update public.verification_requests
  set
    status = case when approve then 'approved'::public.verification_status
                  else 'rejected'::public.verification_status end,
    decided_by = caller,
    decided_at = now(),
    decision_reason = left(reason_trim, 2000)
  where id = request_id;

  if approve and req.subject_type = 'institution' then
    perform public.admin_set_institution_verified(req.subject_id, true, reason_trim);
  elsif approve and req.subject_type = 'expert_affiliation' then
    -- Affiliation badge: store on expert via evidence; Phase 1 marks request only.
    -- Documented confidence bump applied at ACS recompute when dispute/evidence present.
    null;
  end if;

  if req.subject_type = 'expert_affiliation' then
    select e.user_id into expert_user from public.experts e where e.id = req.subject_id;
    if expert_user is not null then
      perform public.notify_user(
        expert_user,
        'verification_result',
        jsonb_build_object(
          'request_id', request_id,
          'status', case when approve then 'approved' else 'rejected' end
        ),
        'Verification update on AfriConnecta',
        'Your affiliation verification was ' ||
          case when approve then 'approved' else 'rejected' end || '.'
      );
    end if;
  end if;

  insert into public.audit_log (actor_user_id, action, entity_type, entity_id, reason)
  values (
    caller,
    case when approve then 'verification.approve' else 'verification.reject' end,
    'verification_request',
    request_id::text,
    reason_trim
  );
end;
$$;

create or replace function public.request_institution_verification()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  inst uuid := public.current_institution_id();
  existing uuid;
  new_id uuid;
  website text;
  email text;
  domain_ok boolean := false;
  host text;
  mail_host text;
begin
  if caller is null or public.current_user_role() is distinct from 'institution_member' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if inst is null then
    raise exception 'No institution' using errcode = '42501';
  end if;

  select i.website into website from public.institutions i where i.id = inst;
  select u.email::text into email from auth.users u where u.id = caller;

  if website is not null and email is not null and position('@' in email) > 0 then
    host := lower(regexp_replace(website, '^https?://([^/]+).*$', '\1'));
    host := regexp_replace(host, '^www\.', '');
    mail_host := lower(split_part(email, '@', 2));
    domain_ok := (host = mail_host)
      or (right(host, char_length(mail_host) + 1) = '.' || mail_host)
      or (right(mail_host, char_length(host) + 1) = '.' || host);
  end if;

  select r.id into existing
  from public.verification_requests r
  where r.subject_type = 'institution'
    and r.subject_id = inst
    and r.status = 'pending'
  limit 1;

  if existing is not null then
    return existing;
  end if;

  insert into public.verification_requests (
    subject_type, subject_id, requested_by, method, status, evidence,
    decided_by, decided_at, decision_reason
  ) values (
    'institution',
    inst,
    caller,
    case when domain_ok then 'domain_email'::public.verification_method
         else 'manual'::public.verification_method end,
    case when domain_ok then 'approved'::public.verification_status
         else 'pending'::public.verification_status end,
    jsonb_build_object(
      'website', website,
      'email', email,
      'domain_match', domain_ok
    ),
    case when domain_ok then caller else null end,
    case when domain_ok then now() else null end,
    case when domain_ok
      then 'Auto-approved: contact email domain matches institution website'
      else null end
  )
  returning id into new_id;

  if domain_ok then
    update public.institutions
    set verified_at = coalesce(verified_at, now())
    where id = inst;

    insert into public.audit_log (actor_user_id, action, entity_type, entity_id, reason)
    values (
      caller,
      'institution.verify',
      'institution',
      inst::text,
      'Auto-approved: contact email domain matches institution website'
    );
  end if;

  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.education enable row level security;
alter table public.experiences enable row level security;
alter table public.expert_availability enable row level security;
alter table public.african_context_scores enable row level security;
alter table public.acs_disputes enable row level security;
alter table public.match_runs enable row level security;
alter table public.match_results enable row level security;
alter table public.verification_requests enable row level security;

-- Education / experiences / availability: owner + admin; published profile readable
-- for public non-sensitive fields (org/role/type) — same visibility as profile.
create policy education_select on public.education
  for select to authenticated
  using (
    exists (
      select 1 from public.experts e
      where e.id = expert_id
        and (
          e.user_id = (select auth.uid())
          or (select public.is_admin())
          or (e.published_at is not null and e.profile_visibility = 'public' and e.deleted_at is null)
        )
    )
  );

create policy education_write_own on public.education
  for all to authenticated
  using (
    exists (
      select 1 from public.experts e
      where e.id = expert_id and e.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.experts e
      where e.id = expert_id and e.user_id = (select auth.uid())
    )
  );

create policy experiences_select on public.experiences
  for select to authenticated
  using (
    exists (
      select 1 from public.experts e
      where e.id = expert_id
        and (
          e.user_id = (select auth.uid())
          or (select public.is_admin())
          or (e.published_at is not null and e.profile_visibility = 'public' and e.deleted_at is null)
        )
    )
  );

create policy experiences_write_own on public.experiences
  for all to authenticated
  using (
    exists (
      select 1 from public.experts e
      where e.id = expert_id and e.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.experts e
      where e.id = expert_id and e.user_id = (select auth.uid())
    )
  );

create policy expert_availability_select on public.expert_availability
  for select to authenticated
  using (
    exists (
      select 1 from public.experts e
      where e.id = expert_id
        and (
          e.user_id = (select auth.uid())
          or (select public.is_admin())
          or (e.published_at is not null and e.profile_visibility <> 'hidden' and e.deleted_at is null)
        )
    )
  );

create policy expert_availability_write_own on public.expert_availability
  for all to authenticated
  using (
    exists (
      select 1 from public.experts e
      where e.id = expert_id and e.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.experts e
      where e.id = expert_id and e.user_id = (select auth.uid())
    )
  );

-- ACS breakdown: owner or admin only (§8.1).
create policy african_context_scores_select on public.african_context_scores
  for select to authenticated
  using (
    exists (
      select 1 from public.experts e
      where e.id = expert_id
        and (e.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

-- Inserts only from service path: grant insert to authenticated but WITH CHECK owner/admin
-- after they computed server-side (same session).
create policy african_context_scores_insert on public.african_context_scores
  for insert to authenticated
  with check (
    exists (
      select 1 from public.experts e
      where e.id = expert_id
        and (e.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

create policy acs_disputes_select on public.acs_disputes
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or (select public.is_admin())
    or exists (
      select 1 from public.experts e
      where e.id = expert_id and e.user_id = (select auth.uid())
    )
  );

create policy acs_disputes_insert_own on public.acs_disputes
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.experts e
      where e.id = expert_id and e.user_id = (select auth.uid())
    )
  );

create policy match_runs_select on public.match_runs
  for select to authenticated
  using (
    public.is_member_of(institution_id)
    or (select public.is_admin())
  );

create policy match_runs_insert on public.match_runs
  for insert to authenticated
  with check (
    actor_user_id = (select auth.uid())
    and public.is_member_of(institution_id)
  );

create policy match_results_select on public.match_results
  for select to authenticated
  using (
    exists (
      select 1 from public.match_runs r
      where r.id = match_run_id
        and (public.is_member_of(r.institution_id) or (select public.is_admin()))
    )
  );

create policy match_results_insert on public.match_results
  for insert to authenticated
  with check (
    exists (
      select 1 from public.match_runs r
      where r.id = match_run_id
        and r.actor_user_id = (select auth.uid())
        and public.is_member_of(r.institution_id)
    )
  );

create policy verification_requests_select on public.verification_requests
  for select to authenticated
  using (
    requested_by = (select auth.uid())
    or (select public.is_admin())
    or (
      subject_type = 'institution'
      and public.is_member_of(subject_id)
    )
  );

create policy verification_requests_insert on public.verification_requests
  for insert to authenticated
  with check (requested_by = (select auth.uid()));

revoke all on function public.admin_set_institution_verified(uuid, boolean, text) from public, anon;
revoke all on function public.decide_verification_request(uuid, boolean, text) from public, anon;
revoke all on function public.request_institution_verification() from public, anon;

grant execute on function public.admin_set_institution_verified(uuid, boolean, text) to authenticated;
grant execute on function public.decide_verification_request(uuid, boolean, text) to authenticated;
grant execute on function public.request_institution_verification() to authenticated;

comment on table public.african_context_scores is
  'Append-only ACS history §5 / M5. Client cannot update totals.';
comment on table public.match_runs is
  'Explainability journal §2.4 / §6. Written on each match run.';
comment on table public.verification_requests is
  'Phase 1 verification queue §11. ORCID deferred Phase 1.5.';
