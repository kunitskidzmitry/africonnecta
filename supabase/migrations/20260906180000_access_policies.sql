-- Матрица доступа (WP4). Соответствует §8.1 docs/implementation-prompt.md.
--
-- До этой миграции RLS был включён везде и не имел ни одной политики, кроме чтения
-- справочников и собственной строки. Это безопасное состояние, но нерабочее. Здесь
-- появляются права — и каждое из них написано так, чтобы отсутствие явного разрешения
-- означало отказ (§8.2, deny by default).
--
-- Две вещи, которые RLS не делает, и о которых поэтому пришлось позаботиться отдельно:
--
--   1. RLS работает построчно. Она может скрыть строку эксперта целиком, но не может
--      отдать строку без телефона. Между тем главная ценность продукта — контакты, и
--      их выкачивание названо риском номер один (§9). Поэтому доступ к колонкам
--      с контактами отобран правами Postgres на уровне колонок, а выдаются они
--      функцией с проверкой квоты и записью в журнал.
--
--   2. RLS не ведёт учёт. «По квоте» из матрицы — это состояние, которое надо где-то
--      хранить, поэтому появляются таблицы plan_limits и contact_disclosures.

-- ---------------------------------------------------------------------------
-- Вспомогательные функции
--
-- Все — security definer, то есть выполняются с правами владельца и не подчиняются RLS.
-- Без этого политика на public.users, которой нужно знать роль пользователя, обращалась бы
-- к public.users и вызвала бесконечную рекурсию.
--
-- Пустой search_path обязателен: иначе вызывающий может подставить свою схему
-- с подложными таблицами и подменить результат проверки прав.
-- ---------------------------------------------------------------------------

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  -- Заблокированный или удалённый пользователь роли не имеет: все проверки ниже
  -- получат null и не пройдут.
  select u.role
  from public.users u
  where u.id = (select auth.uid())
    and u.status = 'active'
    and u.deleted_at is null;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

create or replace function public.is_member_of(target_institution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.institution_members m
    join public.users u on u.id = m.user_id
    where m.institution_id = target_institution_id
      and m.user_id = (select auth.uid())
      and u.status = 'active'
      and u.deleted_at is null
  );
$$;

create or replace function public.is_owner_of(target_institution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.institution_members m
    join public.users u on u.id = m.user_id
    where m.institution_id = target_institution_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
      and u.status = 'active'
      and u.deleted_at is null
  );
$$;

create or replace function public.current_institution_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  -- В Фазе 1 у пользователя ровно одно членство (§2.5). limit 1 — не заглушка,
  -- а явное следствие этого ограничения; при включении команд функция уйдёт.
  select m.institution_id
  from public.institution_members m
  where m.user_id = (select auth.uid())
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Тарифные лимиты
--
-- Источник задаёт правило, но не числа: «N первых контактов в сутки на институцию,
-- M на пользователя» (§9). Поэтому лимиты хранятся данными, а не константами в коде —
-- их можно менять без миграции, и они переживут появление платных тарифов (Phase 1.5).
--
-- Значения ниже осторожные и подлежат подтверждению заказчиком. Ориентир: в Фазе 1
-- на платформе 200 экспертов. Лимит 5 раскрытий в сутки означает, что institution
-- дойдёт до всей базы за 40 дней непрерывной работы — достаточно медленно, чтобы
-- аномалия попала в журнал и была замечена.
-- ---------------------------------------------------------------------------

create table public.plan_limits (
  plan text primary key,
  contact_disclosures_per_day smallint not null check (contact_disclosures_per_day >= 0),
  first_contacts_per_day smallint not null check (first_contacts_per_day >= 0)
);

insert into public.plan_limits (plan, contact_disclosures_per_day, first_contacts_per_day)
values ('free', 5, 5);

alter table public.plan_limits enable row level security;

-- ---------------------------------------------------------------------------
-- Журнал раскрытия контактов
--
-- Уникальность по паре (институция, эксперт) осознанная: повторный просмотр уже
-- полученных контактов квоту не расходует. Данные у институции и так есть, а списывать
-- за повторный показ значило бы наказывать за нормальную работу. Квота ограничивает
-- скорость охвата новых экспертов — именно то, что защищает базу от выкачивания.
-- ---------------------------------------------------------------------------

create table public.contact_disclosures (
  id bigint generated always as identity primary key,
  institution_id uuid not null references public.institutions (id) on delete cascade,
  expert_id uuid not null references public.experts (id) on delete cascade,
  disclosed_to uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (institution_id, expert_id)
);

create index contact_disclosures_institution_time_idx
  on public.contact_disclosures (institution_id, created_at desc);

alter table public.contact_disclosures enable row level security;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

create policy users_select_admin on public.users
  for select using (public.is_admin());

-- Пользователь правит только собственную строку. Какие именно колонки ему доступны,
-- решает grant ниже: роль и статус менять нельзя даже себе.
create policy users_update_own on public.users
  for update
  using (id = (select auth.uid()) and public.current_user_role() is not null)
  with check (id = (select auth.uid()));

revoke update on public.users from anon, authenticated;
grant update (locale) on public.users to authenticated;

-- ---------------------------------------------------------------------------
-- experts
-- ---------------------------------------------------------------------------

-- Владелец видит свой профиль всегда, включая черновик и скрытый.
create policy experts_select_own on public.experts
  for select using (user_id = (select auth.uid()));

create policy experts_select_admin on public.experts
  for select using (public.is_admin());

-- Всем остальным профиль виден, только если он опубликован, не удалён и его видимость
-- это позволяет. Значение 'hidden' не проходит ни одну ветку — профиль исчезает
-- из выдачи, оставаясь доступным владельцу.
create policy experts_select_visible on public.experts
  for select
  using (
    deleted_at is null
    and published_at is not null
    and (
      profile_visibility = 'public'
      -- Проверяется роль, а не наличие сессии: у заблокированного пользователя
      -- сессия остаётся действительной до истечения токена, но прав у него нет.
      or (profile_visibility = 'authenticated' and public.current_user_role() is not null)
    )
  );

-- Заблокированный пользователь свои данные не правит: current_user_role() отдаёт null
-- для любого статуса, кроме active.
create policy experts_update_own on public.experts
  for update
  using (user_id = (select auth.uid()) and public.current_user_role() is not null)
  with check (user_id = (select auth.uid()));

-- Правки администратора идут через функции с записью в журнал (§8.1: «✅ с audit»),
-- поэтому прямого доступа на запись у него нет — как и у всех.
revoke update on public.experts from anon, authenticated;
grant update (
  first_name, last_name, title, academic_level, highest_degree,
  current_institution_id, current_institution_name, country_id, bio,
  photo_file_id, cv_file_id, phone, profile_visibility, published_at
) on public.experts to authenticated;

-- ---------------------------------------------------------------------------
-- Контакты эксперта: защита на уровне колонок
--
-- Это ключевое место всей миграции. RLS решает, видна ли строка, но не может
-- отдать её без телефона. Если оставить колонку доступной, любой вошедший пользователь
-- выгрузит контакты всех опубликованных профилей одним запросом — при том, что
-- «выкачивание базы экспертов» названо риском номер один (§9).
--
-- Право select снимается со всей таблицы и возвращается поимённо по колонкам.
-- Следствие, о котором надо помнить: новая колонка по умолчанию будет недоступна,
-- пока её не добавят в этот список. Это намеренно — забыть закрыть опаснее,
-- чем забыть открыть.
--
-- Второе следствие: запрос вида select('*') теперь завершается ошибкой для всех.
-- Колонки надо перечислять явно, что и так правильно.
-- ---------------------------------------------------------------------------

revoke select on public.experts from anon, authenticated;
grant select (
  id, user_id, first_name, last_name, title, academic_level, highest_degree,
  current_institution_id, current_institution_name, country_id, bio,
  photo_file_id, orcid_id, profile_visibility, published_at,
  created_at, updated_at, deleted_at
) on public.experts to anon, authenticated;

revoke select on public.institutions from anon, authenticated;
grant select (
  id, name, type, country_id, website, ror_id, verified_at, plan,
  created_at, updated_at, deleted_at
) on public.institutions to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Связи эксперта
--
-- Политика ссылается на public.experts обычным подзапросом, и это работает на нас:
-- в подзапросе RLS таблицы experts применяется тоже. Видимость областей экспертизы
-- и языков автоматически повторяет видимость самого профиля, без дублирования правил.
-- ---------------------------------------------------------------------------

create policy expert_expertise_select on public.expert_expertise
  for select using (exists (select 1 from public.experts e where e.id = expert_id));

create policy expert_expertise_write on public.expert_expertise
  for all
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

create policy expert_languages_select on public.expert_languages
  for select using (exists (select 1 from public.experts e where e.id = expert_id));

create policy expert_languages_write on public.expert_languages
  for all
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

-- ---------------------------------------------------------------------------
-- institutions
--
-- Сама организация — публичное юридическое лицо, её название и сайт скрывать незачем:
-- они нужны в фасетах поиска. Закрыты только контактные данные конкретного человека,
-- и закрыты они грантом на колонки выше.
-- ---------------------------------------------------------------------------

create policy institutions_select_all on public.institutions
  for select using (deleted_at is null or public.is_admin());

create policy institutions_update_owner on public.institutions
  for update
  using (public.is_owner_of(id))
  with check (public.is_owner_of(id));

-- Верификацию и тариф институция себе не проставляет: это решение платформы (§11).
revoke update on public.institutions from anon, authenticated;
grant update (
  name, type, country_id, website, ror_id, contact_person, contact_email, contact_phone
) on public.institutions to authenticated;

-- ---------------------------------------------------------------------------
-- institution_members
-- ---------------------------------------------------------------------------

create policy institution_members_select on public.institution_members
  for select using (public.is_member_of(institution_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- files
-- ---------------------------------------------------------------------------

create policy files_select_own on public.files
  for select using (owner_user_id = (select auth.uid()) or public.is_admin());

create policy files_insert_own on public.files
  for insert with check (owner_user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Справочники и лимиты: читают все, пишет никто
-- ---------------------------------------------------------------------------

create policy plan_limits_read_all on public.plan_limits for select using (true);

-- ---------------------------------------------------------------------------
-- audit_log
--
-- Пишется только функциями с security definer, поэтому политики на запись нет вовсе.
-- Читает администратор — журнал ему нужен по определению задачи (§13).
-- ---------------------------------------------------------------------------

create policy audit_log_select_admin on public.audit_log
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- contact_disclosures: читает своя институция, пишет только функция раскрытия
-- ---------------------------------------------------------------------------

create policy contact_disclosures_select on public.contact_disclosures
  for select using (public.is_member_of(institution_id) or public.is_admin());
