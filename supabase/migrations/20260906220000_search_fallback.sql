-- Пустая выдача (§10): расширение по иерархии и поиск с опечатками.
--
-- §10 называет холодный старт главным риском провала проекта — и не техническим.
-- 200 экспертов на всю Руанду означают, что специализированный запрос вернёт ноль,
-- и двусторонний маркетплейс с пустым экраном умирает раньше, чем упрётся
-- в производительность. Поэтому «никогда не показывать пустой экран» — требование
-- уровня MVP, а не улучшение на потом.
--
-- Две функции ниже дают ровно два запасных пути и ничего не решают сами.
-- Решает вызывающий: сначала точный поиск, и только на пустом результате — расширение.
-- Так сделано намеренно. Если бы search_experts подставляла расширение сама, её ответ
-- перестал бы означать «вот кто подходит под запрос»: строки в нём иногда были бы
-- ответом на другой, молча заданный вопрос. Пометка «расширенный поиск» из §10 честна
-- только тогда, когда расширение — отдельный, видимый в коде шаг.

-- ---------------------------------------------------------------------------
-- Расширение фасета до соседей по иерархии
--
-- «Ближайшие по иерархии» для двухуровневого справочника — это всё поддерево того же
-- корня: {14} (эпидемиология) превращается в {3, 13, 14} — корень «Health» вместе
-- с общественным здравоохранением.
--
-- Корень расширяется тоже, и это не формальность: фасет сравнивает идентификаторы точно,
-- поэтому профиль, помеченный только эпидемиологией, под фильтром «Health» не находится.
-- {3} → {3, 13, 14} добавляет к запросу именно таких людей.
--
-- Набор не меняется ровно тогда, когда в запросе уже было целое поддерево. Вызывающий
-- сравнивает наборы и в этом случае второго запроса не делает: показывать пометку
-- «расширенный поиск» над той же самой пустотой — значит обманывать.
-- ---------------------------------------------------------------------------

create or replace function public.expertise_broaden(ids integer[])
returns integer[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(distinct wider.id order by wider.id), '{}'::integer[])
  from public.expertise asked
  join public.expertise root
    on root.id = coalesce(asked.parent_id, asked.id)
  join public.expertise wider
    on wider.id = root.id or wider.parent_id = root.id
  -- Имя функции без схемы: в SQL-функциях параметр уточняется именно так,
  -- public.expertise_broaden.ids Postgres прочитает как ссылку на таблицу.
  where asked.id = any (expertise_broaden.ids);
$$;

comment on function public.expertise_broaden is
  'Области того же корня, что и переданные (§10, «ближайшие по иерархии»). Для корневой '
  'области возвращает её саму с детьми: шире расширять нечего.';

grant execute on function public.expertise_broaden(integer[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Поиск с опечатками
--
-- Здесь живёт вторая половина §4.8: «GIN + pg_trgm по имени эксперта и названию
-- института (поиск с опечатками)». Отдельной функцией, а не третьей ветвью внутри
-- search_experts, по той же причине, что и расширение фасета: «Univerity of Rwanda»
-- и «University of Rwanda» — это два разных вопроса, и смешивать их ответы в одной
-- выдаче значит скрывать от пользователя, на какой из них ему ответили.
--
-- Фасетов и пагинации нет намеренно. Это подсказка на пустой экран, а не выдача:
-- двадцати ближайших по написанию достаточно, а фильтровать список, который и так
-- собран по слабому признаку, — значит выдавать догадку за точный ответ.
--
-- Порог сходства задан явно вместо оператора %: тот берёт порог из настройки сессии
-- pg_trgm.similarity_threshold, а её значение в запросе не видно. Явное число делает
-- поведение функции воспроизводимым и не зависящим от того, что кто-то выставил рядом.
-- 0.3 — то же, что и по умолчанию у pg_trgm.
--
-- Стоимость: 80 мс на 10 000 профилях под ролью anon. Это в шесть раз дороже точного
-- поиска (13 мс) и по той же причине — similarity() не leakproof, поэтому триграммный
-- индекс под RLS недостижим и сходство считается по каждой строке. Разбор целиком
-- в 20260906200000, там же про переход на security definer.
--
-- В бюджет §3 (300 мс) это укладывается, но с меньшим запасом, а растёт линейно:
-- около 40 000 опубликованных профилей путь упрётся в бюджет раньше точного поиска.
-- Ориентир Фазы 1 — 200 экспертов (§9), там счёт идёт на единицы миллисекунд. Важно
-- другое: по §10 на холодном старте этот путь как раз частый, поэтому мерить его надо
-- вместе с остальными, а не считать редким исключением.
-- ---------------------------------------------------------------------------

create or replace function public.search_experts_similar(
  q text default null,
  page_size integer default 20
)
returns setof public.expert_search_row
language sql
stable
security invoker
set search_path = ''
as $$
  with scored as (
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
      -- Выражения повторяют индексные в точности: experts_name_trgm_idx построен
      -- по first_name || ' ' || last_name, а не по варианту с coalesce. Обе колонки
      -- имени объявлены not null, так что coalesce тут и не нужен, а институт может
      -- быть пустым — greatest пропускает null сам и вернёт сходство по имени.
      greatest(
        public.similarity(e.first_name || ' ' || e.last_name, q),
        public.similarity(e.current_institution_name, q)
      ) as rank
    from public.experts e
    where e.deleted_at is null
      and e.published_at is not null
      and e.profile_visibility <> 'hidden'
      and nullif(btrim(coalesce(q, '')), '') is not null
  ),
  page as (
    select s.*
    from scored s
    where s.rank >= 0.3
    -- Порядок по сходству, затем по времени публикации и id: без хвоста две строки
    -- с одинаковым сходством выстраивались бы в произвольном порядке, и один и тот же
    -- запрос отдавал бы разные списки.
    order by s.rank desc, s.published_at desc, s.id desc
    limit least(greatest(coalesce(page_size, 20), 1), 100)
  )
  select
    p.id, p.first_name, p.last_name, p.title, p.academic_level, p.highest_degree,
    p.current_institution_name, p.country_id, p.bio_excerpt, p.photo_file_id,
    public.expert_expertise_ids(p.id),
    public.expert_language_ids(p.id),
    p.rank::real,
    p.published_at
  from page p
  order by p.rank desc, p.published_at desc, p.id desc;
$$;

comment on function public.search_experts_similar is
  'Поиск по написанию имени и названия института для пустой выдачи (§10, §4.8). '
  'Возвращает тот же тип, что search_experts, то есть тоже без контактов (§7).';

grant execute on function public.search_experts_similar(text, integer) to anon, authenticated;
