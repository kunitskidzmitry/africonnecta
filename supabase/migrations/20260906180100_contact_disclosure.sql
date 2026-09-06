-- Доступ к контактам эксперта (WP4, строка «Контакты / CV эксперта» матрицы §8.1).
--
-- Права на колонки с контактами отобраны предыдущей миграцией, поэтому прочитать телефон
-- и CV можно только через функции ниже. Это единственная дверь, и она ведёт учёт:
-- каждое раскрытие расходует квоту тарифа и попадает в audit_log. Без учёта требование
-- «квоты на раскрытие по тарифу; аудит просмотров» (§9) не выполнить в принципе.

-- Собственные коды ошибок, чтобы приложение отличало причины отказа, не разбирая текст
-- сообщения. Стандартные классы SQLSTATE для этих случаев ничего подходящего не дают.
--   AF001 — квота тарифа исчерпана
--   AF002 — институция не верифицирована

-- ---------------------------------------------------------------------------
-- Свой профиль целиком
--
-- Владельцу нужен собственный телефон хотя бы для того, чтобы отредактировать его
-- в форме профиля. Отдельная функция, а не исключение в грантах: права на колонки
-- действуют на роль целиком и построчного «только своё» не умеют.
-- ---------------------------------------------------------------------------

create or replace function public.my_expert_profile()
returns table (
  id uuid,
  first_name text,
  last_name text,
  title text,
  academic_level public.academic_level,
  highest_degree text,
  current_institution_id uuid,
  current_institution_name text,
  country_id smallint,
  bio text,
  phone text,
  photo_file_id uuid,
  cv_file_id uuid,
  orcid_id text,
  profile_visibility public.profile_visibility,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id, e.first_name, e.last_name, e.title, e.academic_level, e.highest_degree,
    e.current_institution_id, e.current_institution_name, e.country_id, e.bio,
    e.phone, e.photo_file_id, e.cv_file_id, e.orcid_id,
    e.profile_visibility, e.published_at
  from public.experts e
  where e.user_id = (select auth.uid())
    and e.deleted_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Раскрытие контактов другому пользователю
-- ---------------------------------------------------------------------------

create or replace function public.reveal_expert_contacts(target_expert_id uuid)
returns table (email text, phone text, cv_file_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role public.user_role := public.current_user_role();
  expert record;
  institution record;
  daily_limit smallint;
  used_today integer;
  already_disclosed boolean;
begin
  if caller is null or caller_role is null then
    raise exception 'Authentication required'
      using errcode = '28000';
  end if;

  select e.id, e.user_id, e.phone, e.cv_file_id, e.profile_visibility, e.published_at,
         e.deleted_at, u.email::text as email
  into expert
  from public.experts e
  join auth.users u on u.id = e.user_id
  where e.id = target_expert_id;

  -- Отсутствующий и удалённый профиль неотличимы снаружи: иначе перебором
  -- идентификаторов можно выяснить, какие эксперты есть в базе.
  if expert.id is null or expert.deleted_at is not null then
    raise exception 'Expert not found'
      using errcode = '42501';
  end if;

  -- Свои контакты доступны всегда, квоту не расходуют и в журнал не пишутся:
  -- это не раскрытие персональных данных третьему лицу.
  if expert.user_id = caller then
    return query select expert.email, expert.phone, expert.cv_file_id;
    return;
  end if;

  if caller_role = 'admin' then
    -- Действие администратора над чужими персональными данными фиксируется всегда (§13).
    insert into public.audit_log (actor_user_id, action, entity_type, entity_id, reason)
    values (caller, 'expert.contacts.reveal', 'expert', target_expert_id::text, 'admin access');

    return query select expert.email, expert.phone, expert.cv_file_id;
    return;
  end if;

  -- Дальше — только представители институций. Эксперт чужие контакты не получает
  -- ни при каких условиях (§8.1): иначе достаточно зарегистрироваться экспертом,
  -- чтобы выгрузить всю базу.
  if caller_role <> 'institution_member' then
    raise exception 'Not allowed to reveal expert contacts'
      using errcode = '42501';
  end if;

  -- Скрытый или неопубликованный профиль не раскрывается никому, кроме владельца
  -- и администратора: он не согласился быть найденным.
  if expert.published_at is null or expert.profile_visibility = 'hidden' then
    raise exception 'Expert not found'
      using errcode = '42501';
  end if;

  select i.id, i.plan, i.verified_at
  into institution
  from public.institutions i
  where i.id = public.current_institution_id();

  if institution.id is null then
    raise exception 'Not allowed to reveal expert contacts'
      using errcode = '42501';
  end if;

  -- Право на контакт появляется только после проверки институции (§9).
  if institution.verified_at is null then
    raise exception 'Institution is not verified yet'
      using errcode = 'AF002';
  end if;

  select exists (
    select 1 from public.contact_disclosures d
    where d.institution_id = institution.id and d.expert_id = target_expert_id
  ) into already_disclosed;

  if not already_disclosed then
    select l.contact_disclosures_per_day into daily_limit
    from public.plan_limits l
    where l.plan = institution.plan;

    -- Неизвестный тариф — это ошибка конфигурации, а не повод раздать данные.
    if daily_limit is null then
      raise exception 'No limits configured for plan %', institution.plan
        using errcode = 'AF001';
    end if;

    select count(*) into used_today
    from public.contact_disclosures d
    where d.institution_id = institution.id
      and d.created_at > now() - interval '24 hours';

    if used_today >= daily_limit then
      raise exception 'Daily contact disclosure limit reached'
        using errcode = 'AF001';
    end if;

    insert into public.contact_disclosures (institution_id, expert_id, disclosed_to)
    values (institution.id, target_expert_id, caller);
  end if;

  -- В журнал пишется каждый просмотр, а не только первый: аномальные последовательности
  -- видны именно по частоте обращений (§9).
  insert into public.audit_log (actor_user_id, action, entity_type, entity_id, reason)
  values (
    caller, 'expert.contacts.reveal', 'expert', target_expert_id::text,
    case when already_disclosed then 'repeat view' else 'quota consumed' end
  );

  return query select expert.email, expert.phone, expert.cv_file_id;
end;
$$;

comment on function public.reveal_expert_contacts(uuid) is
  'Единственный путь к контактам эксперта. Проверяет право, тратит квоту тарифа '
  'и пишет в audit_log. Права на колонки phone и cv_file_id отобраны у клиентских ролей.';

-- Функции вызываются клиентом через RPC, поэтому право выполнения нужно выдать явно.
grant execute on function public.my_expert_profile() to authenticated;
grant execute on function public.reveal_expert_contacts(uuid) to authenticated;
