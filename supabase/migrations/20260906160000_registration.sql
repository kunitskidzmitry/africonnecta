-- Регистрация обеих ролей (WP3). Источник: Functional Spec §4 «Feature 1: Registration».
--
-- Почему профиль создаётся триггером, а не вторым запросом из приложения.
--
-- Supabase Auth пишет в auth.users, наши профили лежат в public.*. Приложение не может
-- выполнить обе записи в одной транзакции: signUp уходит по HTTP в GoTrue. Если после
-- успешного signUp вставка профиля упадёт, останется учётная запись без профиля — войти
-- можно, а приложения для неё не существует, и повторная регистрация на ту же почту
-- уже не пройдёт. Компенсирующее удаление через admin API — это распределённая транзакция
-- с собственными режимами отказа.
--
-- Триггер AFTER INSERT на auth.users выполняется внутри транзакции GoTrue: исключение
-- здесь откатывает и создание учётной записи. Осиротевших пользователей не бывает
-- по построению. Подробности и альтернативы — docs/decisions/0004-registration-trigger.md.
--
-- Второе следствие, ради которого это сделано именно так: anon-ключ Supabase публичен,
-- он лежит в клиентском бандле. Кто угодно может вызвать signUp напрямую, минуя наши формы
-- и всю валидацию на Zod. Поэтому триггер проверяет входные данные повторно и сам решает,
-- какая роль допустима. Валидация в форме — удобство, валидация здесь — граница доверия.

-- ---------------------------------------------------------------------------
-- Телефон эксперта
--
-- Источник перечисляет Phone среди полей регистрации эксперта, в схеме его не было.
-- Колонка nullable, хотя форма регистрации требует телефон обязательно: профили,
-- засеянные администратором из публичных источников (§10, «холодный старт»), приходят
-- без телефона и обязаны сохраняться.
-- ---------------------------------------------------------------------------

alter table public.experts add column phone text;

comment on column public.experts.phone is
  'Персональные данные: не попадает в списочные ответы GET /experts (§7, §9).';

-- ---------------------------------------------------------------------------
-- Создание профиля при регистрации
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
-- Пустой search_path обязателен для security definer: иначе вызывающий может подсунуть
-- свою схему с подставными таблицами. Все имена ниже указаны полностью.
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  requested_role text := meta ->> 'role';
  resolved_country_id smallint;
  created_institution_id uuid;
begin
  -- Учётные записи без роли в метаданных профиль не получают. Это не дыра, а нужный режим:
  -- так работают сид (supabase/seed.sql) и созданные вручную администраторы. Пользователь
  -- без строки в public.users не имеет роли, а значит не проходит ни одну политику доступа.
  if requested_role is null then
    return new;
  end if;

  -- Роль приходит из данных, которые контролирует клиент, поэтому список допустимых
  -- значений задан здесь. Роль admin через регистрацию не выдаётся никогда и ни при каких
  -- метаданных — её проставляет только администратор напрямую в базе.
  if requested_role not in ('expert', 'institution_member') then
    raise exception 'Registration role % is not allowed', requested_role
      using errcode = 'check_violation';
  end if;

  -- Страна приходит кодом ISO 3166-1 alpha-2 и обязана существовать в справочнике:
  -- свободный ввод сломал бы фасетный поиск (§4.3).
  select c.id into resolved_country_id
  from public.countries c
  where c.iso2 = upper(coalesce(meta ->> 'country', ''));

  if resolved_country_id is null then
    raise exception 'Unknown country code %', meta ->> 'country'
      using errcode = 'foreign_key_violation';
  end if;

  -- Статус pending до подтверждения почты. Перевод в active делает второй триггер.
  insert into public.users (id, role, status, locale)
  values (
    new.id,
    requested_role::public.user_role,
    'pending',
    coalesce(nullif(meta ->> 'locale', ''), 'en')
  );

  if requested_role = 'expert' then
    if coalesce(trim(meta ->> 'first_name'), '') = ''
      or coalesce(trim(meta ->> 'last_name'), '') = ''
    then
      raise exception 'Expert registration requires first and last name'
        using errcode = 'check_violation';
    end if;

    -- Место работы пишется текстом: в Фазе 1 в справочнике институций десять записей,
    -- а экспертов двести, поэтому у большинства работодателя там не окажется (§4.2).
    if coalesce(trim(meta ->> 'current_institution'), '') = '' then
      raise exception 'Expert registration requires a current institution'
        using errcode = 'check_violation';
    end if;

    insert into public.experts (
      user_id, first_name, last_name, phone, title, highest_degree,
      current_institution_name, country_id, bio
    )
    values (
      new.id,
      trim(meta ->> 'first_name'),
      trim(meta ->> 'last_name'),
      nullif(trim(coalesce(meta ->> 'phone', '')), ''),
      nullif(trim(coalesce(meta ->> 'title', '')), ''),
      nullif(trim(coalesce(meta ->> 'highest_degree', '')), ''),
      trim(meta ->> 'current_institution'),
      resolved_country_id,
      nullif(trim(coalesce(meta ->> 'bio', '')), '')
    );

  else
    if coalesce(trim(meta ->> 'organization_name'), '') = '' then
      raise exception 'Institution registration requires an organization name'
        using errcode = 'check_violation';
    end if;

    -- Приведение к institution_type упадёт само, если тип не из перечисления.
    -- verified_at остаётся пустым: право писать экспертам появляется только
    -- после верификации института (§9, «спам от институций»).
    insert into public.institutions (
      name, type, country_id, website, contact_person, contact_email, contact_phone
    )
    values (
      trim(meta ->> 'organization_name'),
      (meta ->> 'institution_type')::public.institution_type,
      resolved_country_id,
      nullif(trim(coalesce(meta ->> 'website', '')), ''),
      nullif(trim(coalesce(meta ->> 'contact_person', '')), ''),
      new.email,
      nullif(trim(coalesce(meta ->> 'phone', '')), '')
    )
    returning id into created_institution_id;

    -- Регистрирующий становится владельцем. В Фазе 1 это единственный участник (§2.5),
    -- но роль проставляется явно, чтобы включение команд в Phase 1.5 не потребовало
    -- переписывания модели доступа.
    insert into public.institution_members (institution_id, user_id, role)
    values (created_institution_id, new.id, 'owner');
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Создаёт профиль приложения в одной транзакции с auth.users. Повторно проверяет данные, '
  'потому что anon-ключ публичен и signUp можно вызвать в обход форм.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Активация после подтверждения почты
--
-- Триггером, а не в обработчике callback: подтвердить почту можно из другого браузера
-- или устройства, и тогда наш callback не выполнится вовсе. База — единственное место,
-- которое видит факт подтверждения гарантированно.
-- ---------------------------------------------------------------------------

create or replace function public.handle_user_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users
  set status = 'active'
  where id = new.id
    and status = 'pending';

  return new;
end;
$$;

create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_email_confirmed();

-- ---------------------------------------------------------------------------
-- Минимальное чтение собственного профиля
--
-- Полная матрица доступа §8.1 — это WP4. Здесь ровно одна политика, без которой
-- зарегистрировавшийся пользователь не может прочитать даже собственную строку,
-- и сценарий не проверить end-to-end. Чужие строки по-прежнему недоступны.
-- ---------------------------------------------------------------------------

create policy users_select_own on public.users
  for select
  using (id = (select auth.uid()));
