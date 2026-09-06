-- Массовый сид профилей для проверки бюджета §3: p95 поиска ≤ 300 мс.
--
-- Три профиля из supabase/seed.sql проверяют права, но о производительности не говорят
-- ничего: на такой таблице планировщик выбирает последовательное чтение и любой запрос
-- укладывается в микросекунды. §12 требует «≥ 10k профилей с правдоподобным
-- распределением, не 20 записей».
--
-- Данные выводятся из номера строки, а не из random(), чтобы два прогона давали
-- одинаковую базу и замеры можно было сравнивать между собой.
--
-- Запуск: npm run db:seed:bulk [количество]   (по умолчанию 10000)

\set ON_ERROR_STOP on
\if :{?count}
\else
  \set count 10000
\endif

-- ---------------------------------------------------------------------------
-- Предохранитель: тот же, что в supabase/seed.sql
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from auth.users where email is null or email not like '%@example.test') then
    raise exception
      'Массовый сид остановлен: в базе есть учётные записи вне домена example.test. '
      'Похоже, это не локальная база.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Заготовки
--
-- Пароль один и тот же и вписан готовым хешем: crypt() на каждую из десяти тысяч строк
-- считался бы минутами, а входить этими учётными записями всё равно незачем.
-- ---------------------------------------------------------------------------

-- Каждое поле выводится из своего хеша от номера строки, а не из n по модулю.
--
-- Первая версия брала всё от n напрямую, и совпадение модулей склеило независимые
-- признаки: тема с индексом n % 10 совпала с признаком черновика n % 10 = 0, поэтому
-- все специалисты по машинному обучению оказались неопубликованными и поиск по этому
-- слову возвращал ноль. Скрытые (n % 20 = 0) целиком попали внутрь черновиков, то есть
-- ни одного опубликованного скрытого профиля в базе не появилось — а это ровно тот
-- случай, который выдача обязана отсекать.
--
-- hashtext от разных строк-затравок даёт независимые признаки и остаётся
-- воспроизводимым: одинаковый вход — одинаковый выход.
create temp table bulk_rows as
select
  n,
  gen_random_uuid() as user_id,
  gen_random_uuid() as expert_id,
  (hashtext(n::text || ':name') & 2147483647) as h_name,
  (hashtext(n::text || ':surname') & 2147483647) as h_surname,
  (hashtext(n::text || ':topic') & 2147483647) as h_topic,
  (hashtext(n::text || ':institution') & 2147483647) as h_institution,
  (hashtext(n::text || ':level') & 2147483647) as h_level,
  (hashtext(n::text || ':country') & 2147483647) as h_country,
  (hashtext(n::text || ':visibility') & 2147483647) as h_visibility,
  (hashtext(n::text || ':draft') & 2147483647) as h_draft,
  (hashtext(n::text || ':age') & 2147483647) as h_age,
  (hashtext(n::text || ':links') & 2147483647) as h_links
from generate_series(1, :count) as n;

create temp table bulk_names (idx integer, value text);
insert into bulk_names (idx, value)
select row_number() over () - 1, value
from unnest(array[
  'Yves', 'Grace', 'Samuel', 'Aline', 'Emmanuel', 'Chantal', 'Jean', 'Immaculee',
  'Patrick', 'Solange', 'Thierry', 'Josiane', 'Eric', 'Claudine', 'Fidele', 'Beatrice',
  'Olivier', 'Esperance', 'Innocent', 'Providence'
]) as value;

create temp table bulk_surnames (idx integer, value text);
insert into bulk_surnames (idx, value)
select row_number() over () - 1, value
from unnest(array[
  'Habimana', 'Nyirahabimana', 'Otieno', 'Mukamana', 'Nkurunziza', 'Uwimana',
  'Kagabo', 'Mutesi', 'Bizimana', 'Ingabire', 'Rwigema', 'Nsengimana',
  'Karangwa', 'Umutoni', 'Twagirayezu', 'Mukandayisenga'
]) as value;

-- Тексты биографий содержат предметные слова: без них полнотекстовый индекс нечем
-- проверять, а ts_rank_cd на пустых документах всегда возвращал бы одно и то же.
create temp table bulk_topics (idx integer, topic text, sentence text);
insert into bulk_topics (idx, topic, sentence)
select row_number() over () - 1, topic, sentence
from (
  values
    ('machine learning', 'Builds machine learning models for smallholder yield prediction.'),
    ('public health', 'Studies community health systems and vaccination coverage.'),
    ('climate change', 'Researches climate adaptation for highland agriculture.'),
    ('economics', 'Works on rural credit markets and household economics.'),
    ('epidemiology', 'Investigates outbreak surveillance and epidemiology of malaria.'),
    ('cybersecurity', 'Advises on cybersecurity policy for public institutions.'),
    ('data science', 'Applies data science to mobile money transaction records.'),
    ('public policy', 'Evaluates public policy on land tenure reform.'),
    ('sustainability', 'Designs sustainability metrics for urban water supply.'),
    ('law', 'Teaches constitutional law and administrative procedure.')
) as t (topic, sentence);

create temp table bulk_institutions (idx integer, value text);
insert into bulk_institutions (idx, value)
select row_number() over () - 1, value
from unnest(array[
  'University of Rwanda', 'Kigali Institute of Science', 'Makerere University',
  'University of Nairobi', 'Addis Ababa University', 'University of Ghana',
  'Université Cheikh Anta Diop', 'Rwanda Polytechnic', 'African Institute for Development',
  'Kigali Health Institute'
]) as value;

-- ---------------------------------------------------------------------------
-- Учётные записи
--
-- raw_user_meta_data пустой намеренно: триггер handle_new_user при отсутствии role
-- выходит сразу, поэтому профили создаются ниже явно, а не дважды.
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  r.user_id,
  'authenticated',
  'authenticated',
  format('bulk.%s@example.test', r.n),
  '$2a$10$PZS4pFXBcCC7YMCyGZbxfeQ4z1TZaJ0nsWv0Wnx.uAiVQeGxV8Nqu',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
from bulk_rows r;

insert into public.users (id, role, status, locale)
select r.user_id, 'expert', 'active', 'en'
from bulk_rows r;

-- ---------------------------------------------------------------------------
-- Профили
--
-- Распределение задано так, чтобы поиск встречал все ветки:
--   ~10 % черновиков и ~5 % скрытых — их выдача обязана отсекать;
--   ~15 % видны только вошедшим — на них проверяется роль вызывающего;
--   время публикации размазано по месяцу — иначе keyset-порядок вырождается.
-- ---------------------------------------------------------------------------

insert into public.experts (
  id, user_id, first_name, last_name, title, academic_level, highest_degree,
  current_institution_name, country_id, bio, phone, profile_visibility,
  published_at, created_at, updated_at
)
select
  r.expert_id,
  r.user_id,
  nm.value,
  sn.value,
  (array['Professor', 'Senior Lecturer', 'Research Fellow', 'Lecturer'])[1 + r.h_level % 4],
  (array['professor', 'lecturer', 'researcher', 'phd_candidate', null])[1 + r.h_level % 5]
    ::public.academic_level,
  (array['PhD', 'MSc', 'MPhil', 'PhD'])[1 + r.h_level % 4],
  inst.value,
  c.id,
  format(
    '%s %s Based in %s, working with %s.',
    tp.sentence,
    (array[
      'Supervises graduate students and field teams.',
      'Publishes in regional and international venues.',
      'Collaborates with ministries on evidence uptake.',
      'Leads a small research group.'
    ])[1 + r.h_topic % 4],
    c.name,
    inst.value
  ),
  format('+25078%s', lpad((r.n % 1000000)::text, 6, '0')),
  case
    when r.h_visibility % 20 = 0 then 'hidden'
    when r.h_visibility % 7 = 0 then 'authenticated'
    else 'public'
  end::public.profile_visibility,
  case when r.h_draft % 10 = 0 then null else now() - ((r.h_age % 720) * interval '1 hour') end,
  now(),
  now()
from bulk_rows r
join bulk_names nm on nm.idx = r.h_name % (select count(*) from bulk_names)
join bulk_surnames sn on sn.idx = r.h_surname % (select count(*) from bulk_surnames)
join bulk_topics tp on tp.idx = r.h_topic % (select count(*) from bulk_topics)
join bulk_institutions inst on inst.idx = r.h_institution % (select count(*) from bulk_institutions)
join lateral (
  -- Руанда встречается чаще прочих: Фаза 1 — это Руанда (§11).
  select id, name
  from public.countries
  order by case when iso2 = 'RW' then 0 else 1 + (id + r.h_country) % 12 end
  limit 1
) c on true;

-- ---------------------------------------------------------------------------
-- Связи
--
-- От одной до трёх областей и от одного до трёх языков: фасеты должны и отсекать,
-- и пересекаться, иначе фильтр по области всегда возвращал бы либо всё, либо ничего.
-- ---------------------------------------------------------------------------

insert into public.expert_expertise (expert_id, expertise_id, is_primary)
select distinct on (r.expert_id, x.id)
  r.expert_id,
  x.id,
  false
from bulk_rows r
join lateral (
  select id
  from public.expertise
  where parent_id is not null
  order by (id * 7 + r.h_links) % 101
  limit 1 + r.h_links % 3
) x on true;

insert into public.expert_languages (expert_id, language_id, proficiency)
select distinct on (r.expert_id, l.id)
  r.expert_id,
  l.id,
  (array['b2', 'c1', 'c2', 'native'])[1 + (r.h_links + l.id) % 4]
from bulk_rows r
join lateral (
  select id
  from public.languages
  order by (id * 3 + r.h_name) % 97
  limit 1 + r.h_name % 3
) l on true;

-- Планировщик обязан узнать о новых строках, иначе первый же замер покажет план,
-- построенный по статистике пустой таблицы.
analyze public.experts;
analyze public.expert_expertise;
analyze public.expert_languages;

-- Разбивка нужна не для красоты: если признаки снова склеятся, какая-нибудь клетка
-- окажется нулевой, и это будет видно сразу, а не через странный замер.
select
  count(*) as experts_total,
  count(*) filter (where published_at is null) as drafts,
  count(*) filter (where published_at is not null and profile_visibility = 'hidden')
    as published_hidden,
  count(*) filter (where published_at is not null and profile_visibility = 'authenticated')
    as published_for_members,
  count(*) filter (
    where deleted_at is null and published_at is not null and profile_visibility <> 'hidden'
  ) as searchable
from public.experts;

-- Каждая тема обязана встречаться и среди опубликованных: иначе поиск по её слову
-- вернёт ноль, и замер по этому слову ничего не измерит.
select
  substring(bio from 'Builds|Studies|Researches|Works|Investigates|Advises|Applies|Evaluates|Designs|Teaches')
    as topic_verb,
  count(*) filter (where published_at is not null and profile_visibility <> 'hidden') as searchable
from public.experts
where bio is not null
group by 1
order by 1;
