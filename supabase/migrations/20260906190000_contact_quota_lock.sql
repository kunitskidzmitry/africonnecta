-- Квота раскрытия контактов перестаёт обходиться параллельными запросами.
--
-- Прежняя версия reveal_expert_contacts считала израсходованное за сутки, сравнивала
-- с лимитом тарифа и вставляла строку тремя отдельными действиями. Между подсчётом
-- и вставкой другая транзакция успевала сделать то же самое: на уровне READ COMMITTED
-- она не видит незафиксированную вставку соседа, поэтому обе получали одно и то же
-- «израсходовано 0» и обе проходили проверку.
--
-- Проверено на живом стенде: при лимите 1 две одновременные транзакции получили
-- контакты двух разных экспертов и записали две строки в contact_disclosures.
-- Скрипт с N запросами обходит квоту примерно в N раз, а квота — единственное, что
-- ограничивает скорость съёма базы (§7). Само раскрытие при этом остаётся законным:
-- институция верифицирована, профили опубликованы, ни одна проверка прав не нарушена.
--
-- Лечится блокировкой на институцию, взятой до подсчёта. Вторая транзакция ждёт первую,
-- после чего видит её вставку и получает отказ по квоте.
--
-- Консультативная блокировка, а не `select ... for update` на строке институции:
-- та заперла бы саму запись, то есть просмотр контактов мешал бы администратору
-- верифицировать институцию и самой институции править свой профиль. Здесь же
-- запирается ровно право «тратить квоту этой институции», и снимается она
-- автоматически в конце транзакции.

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

  -- Отсюда и до конца транзакции квоту этой институции тратит только одна транзакция.
  -- Взято до чтения already_disclosed, а не только вокруг подсчёта: иначе два
  -- одновременных запроса по одному эксперту оба увидели бы «ещё не раскрыт», и второй
  -- упал бы на уникальном индексе (institution_id, expert_id) вместо того, чтобы пойти
  -- бесплатным путём повторного просмотра.
  --
  -- Первое число — постоянная метка этой блокировки, чтобы не столкнуться с чужими
  -- консультативными блокировками в той же базе. Второе — институция.
  perform pg_advisory_xact_lock(hashtext('reveal_expert_contacts'), hashtext(institution.id::text));

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
  'и пишет в audit_log. Квота защищена консультативной блокировкой на институцию: '
  'без неё параллельные запросы обходят лимит. Права на колонки phone и cv_file_id '
  'отобраны у клиентских ролей.';
