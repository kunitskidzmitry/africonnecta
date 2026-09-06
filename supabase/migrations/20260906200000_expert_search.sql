-- Поиск экспертов (M2): полнотекстовая колонка, индексы под фасеты, функция выдачи.
--
-- Ключевое решение: функция объявлена security invoker, а не definer. Значит, она
-- подчиняется RLS и колоночным грантам вызывающего — тем самым, что уже написаны в
-- 20260906180000_access_policies.sql. Definer был бы проще (полная свобода в теле), но
-- обошёл бы оба рубежа сразу и сделал бы поиск единственным местом, где §7 «списочные
-- ответы не отдают контакты» держится на внимательности автора, а не на правах.
--
-- Поэтому колонок phone и cv_file_id нет и в возвращаемом типе: даже если кто-то однажды
-- впишет их в тело, права на колонки не дадут функции выполниться у клиентских ролей.

-- ---------------------------------------------------------------------------
-- Полнотекстовая колонка
--
-- Генерируемая, а не поддерживаемая триггером: выражение зависит только от колонок той же
-- строки, поэтому Postgres пересчитывает её сам и рассинхронизировать её нечем.
--
-- Названий областей экспертизы здесь нет, хотя §4.8 их упоминает: они лежат в другой
-- таблице, и втянуть их в ту же колонку можно только триггером по трём таблицам сразу
-- (experts, expert_expertise, expertise). Область экспертизы — это фасет с точным
-- совпадением по идентификатору, и как фасет она надёжнее: «AI» в тексте биографии
-- не делает человека специалистом по искусственному интеллекту, а строка в
-- expert_expertise делает. Обоснование целиком — docs/decisions/0007.
--
-- Веса: имя важнее звания, звание важнее биографии. Совпадение в имени должно
-- поднимать человека выше, чем упоминание того же слова в тексте о себе.
-- ---------------------------------------------------------------------------

alter table public.experts
  add column search_document tsvector
  generated always as (
    setweight(
      to_tsvector('english', coalesce(first_name, '') || ' ' || coalesce(last_name, '')),
      'A'
    )
    || setweight(to_tsvector('english', coalesce(title, '')), 'B')
    || setweight(to_tsvector('english', coalesce(current_institution_name, '')), 'C')
    || setweight(to_tsvector('english', coalesce(highest_degree, '')), 'C')
    || setweight(to_tsvector('english', coalesce(bio, '')), 'D')
  ) stored;

comment on column public.experts.search_document is
  'Полнотекстовый образ профиля для поиска. Считается из колонок этой же строки, '
  'области экспертизы в него не входят — они фасет, см. docs/decisions/0007.';

-- ---------------------------------------------------------------------------
-- Индексы полнотекстового поиска, и почему клиентские роли ими не пользуются
--
-- Индексы ниже нужны по §4.8, они рабочие — и под ролями anon и authenticated
-- планировщик их не берёт никогда. Это не просчёт статистики, это правило RLS,
-- и знать о нём важнее, чем о самих индексах.
--
-- Условие, не помеченное leakproof, нельзя вычислять раньше политики: иначе сообщение
-- об ошибке или побочный эффект оператора рассказали бы о строке, которую политика
-- скрывает. Индексное условие — это как раз вычисление до политики, поэтому такой
-- предикат опускается в фильтр после неё. А оба нужных нам оператора не leakproof:
--
--   select proleakproof from pg_proc where proname in ('ts_match_vq', 'similarity');
--   -- f, f
--
-- Отсюда наблюдаемое: под ролью postgres запрос идёт Bitmap Index Scan по
-- experts_search_document_idx (3 буфера на индекс), под ролью anon — последовательным
-- чтением, и с enable_seqscan = off планировщик остаётся при нём же, потому что
-- альтернативы у него нет.
--
-- Насколько это дорого: после починки политик (20260906210000) полнотекстовый поиск
-- по частому слову на 10 000 профилях занимает 13 мс — бюджет §3 (300 мс) соблюдён
-- с запасом в двадцать раз. Стоимость линейна по числу опубликованных профилей,
-- то есть упрётся в бюджет где-то за 150 000. В Фазе 1 ориентир — 200 экспертов (§9).
--
-- Что делать, когда упрётся: перевести search_experts в security definer и проверять
-- видимость телом функции. Сейчас этого делать нельзя не из-за сложности, а из-за §7:
-- definer выполняется правами владельца, то есть теряет колоночные гранты, и запрет
-- на выдачу контактов в списке остаётся держаться на одном возвращаемом типе вместо
-- двух независимых рубежей. Обмен разумен, когда за него платят измеренной нуждой;
-- сегодня за него платить нечем. Подробнее — docs/decisions/0007.
--
-- Индексы при этом создаются: они единственное, что работает на пути service_role
-- (эта роль обходит RLS), и они же понадобятся в тот же день, когда состоится переход.
-- ---------------------------------------------------------------------------

create index experts_search_document_idx
  on public.experts using gin (search_document);

-- §4.8 просит trgm и по названию института: «Univerity of Rwanda» должно находиться.
-- Пользуется индексом поиск с опечатками — ветка пустой выдачи ниже.
create index experts_institution_trgm_idx
  on public.experts using gin (current_institution_name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Индексы под фасеты и порядок
-- ---------------------------------------------------------------------------

-- Фасет по языку: без этого фильтр «говорит по-французски» читает всю таблицу связей.
-- Первичный ключ (expert_id, language_id) для обратного направления не годится.
create index expert_languages_language_idx
  on public.expert_languages (language_id);

-- Расширение выдачи по иерархии при пустом результате (§10) идёт от ребёнка к родителю
-- и обратно, то есть читает expertise по parent_id.
create index expertise_parent_idx on public.expertise (parent_id);

-- Порядок выдачи без текстового запроса — по времени публикации. Частичный индекс:
-- в поиск попадают только опубликованные и неудалённые, а это малая часть таблицы
-- на любом горизонте, где вообще есть черновики.
create index experts_published_order_idx
  on public.experts (published_at desc, id desc)
  where deleted_at is null and published_at is not null;

-- Колонка добавлена после revoke/grant из 20260906180000, поэтому право на неё нужно
-- выдать отдельно. Утечки нет: она построена из колонок, которые и так разрешены.
grant select (search_document) on public.experts to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Связи одной строки выдачи
--
-- Вынесено функциями, потому что обе ветки поиска (просмотр и текстовый запрос)
-- собирают их одинаково, а повторённый в двух местах подзапрос рано или поздно
-- разъезжается. security invoker: RLS на expert_expertise и expert_languages
-- продолжает действовать, как если бы подзапрос стоял на месте вызова.
-- ---------------------------------------------------------------------------

create or replace function public.expert_expertise_ids(target_expert_id uuid)
returns integer[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(x.expertise_id order by x.expertise_id), '{}'::integer[])
  from public.expert_expertise x
  where x.expert_id = target_expert_id;
$$;

create or replace function public.expert_language_ids(target_expert_id uuid)
returns smallint[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(l.language_id order by l.language_id), '{}'::smallint[])
  from public.expert_languages l
  where l.expert_id = target_expert_id;
$$;

grant execute on function public.expert_expertise_ids(uuid) to anon, authenticated;
grant execute on function public.expert_language_ids(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Строка выдачи
--
-- Именованный тип, а не returns table у каждой функции. Причина не в экономии строк:
-- выдачу отдают две функции (точный поиск и поиск с опечатками), и пока список колонок
-- написан дважды, §7 «списочные ответы не отдают контакты» проверяется в двух местах —
-- значит, рано или поздно в одном из них проверку забудут. С типом место одно, и тест
-- tests/integration/search.test.ts спрашивает про запрещённые колонки именно у него.
--
-- Контактов здесь нет. user_id тоже нет, хотя это и не контакт: он связывает профиль
-- с учётной записью, а в списке для этого нет ни одной причины.
-- ---------------------------------------------------------------------------

create type public.expert_search_row as (
  id uuid,
  first_name text,
  last_name text,
  title text,
  academic_level public.academic_level,
  highest_degree text,
  current_institution_name text,
  country_id smallint,
  bio_excerpt text,
  photo_file_id uuid,
  expertise_ids integer[],
  language_ids smallint[],
  rank real,
  published_at timestamptz
);

comment on type public.expert_search_row is
  'Одна строка списочной выдачи поиска. Контактных колонок не содержит (§7).';

-- ---------------------------------------------------------------------------
-- Выдача
-- ---------------------------------------------------------------------------

create or replace function public.search_experts(
  q text default null,
  filter_country_ids smallint[] default null,
  filter_levels public.academic_level[] default null,
  filter_expertise_ids integer[] default null,
  filter_language_ids smallint[] default null,
  after_rank real default null,
  after_published_at timestamptz default null,
  after_id uuid default null,
  page_size integer default 20
)
returns setof public.expert_search_row
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  -- Пустая строка — это «без текстового запроса», а не запрос, которому ничто
  -- не соответствует: иначе форма с пустым полем возвращала бы ноль результатов.
  term text := nullif(btrim(coalesce(search_experts.q, '')), '');
  take integer := least(greatest(coalesce(search_experts.page_size, 20), 1), 100);
  tsq tsquery;
begin
  --
  -- Две ветки, а не одна с `case when term is null then 0 else ts_rank_cd(...)`.
  --
  -- Причина измерена. Пока ранг остаётся выражением, он оказывается первым ключом
  -- сортировки, и порядок из experts_published_order_idx перестаёт годиться:
  -- планировщик читает таблицу целиком и сортирует всех кандидатов. На 10 000 профилях
  -- это 1067 прочитанных буферов против 27 у ветки с индексом, и разрыв растёт линейно
  -- с таблицей, тогда как индексный путь стоит столько же при любом её размере.
  --
  -- Проверять это надо непременно на generic-плане (plan_cache_mode = force_generic_plan).
  -- При custom-плане Postgres подставляет фактическое значение term, видит null, сворачивает
  -- case в константу и убирает его из сортировки — то есть показывает хорошие числа как раз
  -- в том режиме, который plpgsql для горячей функции не использует.
  --
  -- Разделение честное и по смыслу: «просмотр» и «поиск по слову» — разные запросы
  -- с разным естественным порядком. У просмотра ранга нет вообще, поэтому и в keyset
  -- он не участвует; в выдачу он возвращается нулём, чтобы форма ответа не зависела
  -- от того, заполнено ли поле запроса.
  --
  if term is null then
    return query
      with page as (
        select
          e.id,
          e.first_name,
          e.last_name,
          e.title,
          e.academic_level,
          e.highest_degree,
          e.current_institution_name,
          e.country_id,
          left(e.bio, 280) as bio_excerpt,
          e.photo_file_id,
          e.published_at
        from public.experts e
        where e.deleted_at is null
          -- Черновик и скрытый профиль не попадают в выдачу никому. RLS показывает
          -- такую строку владельцу и администратору — им она нужна в кабинете, но не
          -- в списке: иначе «опубликовать» перестаёт что-либо означать. Видимость
          -- 'authenticated' проверяет политика experts_select_visible, здесь её
          -- дублировать нечем — она зависит от роли вызывающего, а не от строки.
          and e.published_at is not null
          and e.profile_visibility <> 'hidden'
          and (
            search_experts.filter_country_ids is null
            or e.country_id = any (search_experts.filter_country_ids)
          )
          and (
            search_experts.filter_levels is null
            or e.academic_level = any (search_experts.filter_levels)
          )
          and (
            search_experts.filter_expertise_ids is null
            or exists (
              select 1
              from public.expert_expertise x
              where x.expert_id = e.id
                and x.expertise_id = any (search_experts.filter_expertise_ids)
            )
          )
          and (
            search_experts.filter_language_ids is null
            or exists (
              select 1
              from public.expert_languages l
              where l.expert_id = e.id
                and l.language_id = any (search_experts.filter_language_ids)
            )
          )
          -- Keyset, а не OFFSET (§4.8). Хвост из id обязателен: без него строки
          -- с одинаковым временем публикации перескакивали бы между страницами,
          -- а keyset одну из них терял бы совсем.
          and (
            search_experts.after_id is null
            or (e.published_at, e.id)
               < (search_experts.after_published_at, search_experts.after_id)
          )
        order by e.published_at desc, e.id desc
        limit take
      )
      select
        p.id, p.first_name, p.last_name, p.title, p.academic_level, p.highest_degree,
        p.current_institution_name, p.country_id, p.bio_excerpt, p.photo_file_id,
        public.expert_expertise_ids(p.id),
        public.expert_language_ids(p.id),
        0::real,
        p.published_at
      from page p
      order by p.published_at desc, p.id desc;

    return;
  end if;

  tsq := websearch_to_tsquery('english', term);

  return query
    with matched as (
      select
        e.id,
        e.first_name,
        e.last_name,
        e.title,
        e.academic_level,
        e.highest_degree,
        e.current_institution_name,
        e.country_id,
        left(e.bio, 280) as bio_excerpt,
        e.photo_file_id,
        e.published_at,
        ts_rank_cd(e.search_document, tsq) as rank
      from public.experts e
      where e.deleted_at is null
        and e.published_at is not null
        and e.profile_visibility <> 'hidden'
        and e.search_document @@ tsq
        and (
          search_experts.filter_country_ids is null
          or e.country_id = any (search_experts.filter_country_ids)
        )
        and (
          search_experts.filter_levels is null
          or e.academic_level = any (search_experts.filter_levels)
        )
        and (
          search_experts.filter_expertise_ids is null
          or exists (
            select 1
            from public.expert_expertise x
            where x.expert_id = e.id
              and x.expertise_id = any (search_experts.filter_expertise_ids)
          )
        )
        and (
          search_experts.filter_language_ids is null
          or exists (
            select 1
            from public.expert_languages l
            where l.expert_id = e.id
              and l.language_id = any (search_experts.filter_language_ids)
          )
        )
    ),
    page as (
      select m.*
      from matched m
      where search_experts.after_id is null
        or (m.rank, m.published_at, m.id)
           < (
             search_experts.after_rank,
             search_experts.after_published_at,
             search_experts.after_id
           )
      order by m.rank desc, m.published_at desc, m.id desc
      limit take
    )
    select
      p.id, p.first_name, p.last_name, p.title, p.academic_level, p.highest_degree,
      p.current_institution_name, p.country_id, p.bio_excerpt, p.photo_file_id,
      -- Связи собираются после limit, то есть по странице, а не по всей выдаче.
      public.expert_expertise_ids(p.id),
      public.expert_language_ids(p.id),
      p.rank,
      p.published_at
    from page p
    order by p.rank desc, p.published_at desc, p.id desc;
end;
$$;

comment on function public.search_experts is
  'Списочная выдача поиска экспертов. security invoker: подчиняется RLS и колоночным '
  'грантам вызывающего. Контактов не возвращает ни при какой роли (§7). Пагинация '
  'keyset по (rank, published_at, id).';

grant execute on function public.search_experts(
  text, smallint[], public.academic_level[], integer[], smallint[],
  real, timestamptz, uuid, integer
) to anon, authenticated;
