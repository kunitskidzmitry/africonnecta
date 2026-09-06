-- Справочные данные. Значения взяты из источника (Functional Spec §5-6,
-- см. docs/transcription.md) и расширены странами Фазы 2 из роадмапа §15.
--
-- Это не тестовые данные: справочники нужны и в проде. Тестовые профили живут
-- в supabase/seed.sql и в прод не попадают.

-- ---------------------------------------------------------------------------
-- Страны
-- ---------------------------------------------------------------------------

insert into countries (iso2, name, region, is_african) values
  -- Фаза 1
  ('RW', 'Rwanda', 'East Africa', true),
  -- Фаза 2: Восточная Африка
  ('KE', 'Kenya', 'East Africa', true),
  ('UG', 'Uganda', 'East Africa', true),
  ('TZ', 'Tanzania', 'East Africa', true),
  -- Прочие страны, названные источником (§6)
  ('NG', 'Nigeria', 'West Africa', true),
  ('ZA', 'South Africa', 'Southern Africa', true),
  ('GH', 'Ghana', 'West Africa', true),
  -- Страны диаспоры: нужны, чтобы эксперт мог указать место жительства
  ('CA', 'Canada', 'North America', false),
  ('US', 'United States', 'North America', false),
  ('GB', 'United Kingdom', 'Europe', false),
  ('FR', 'France', 'Europe', false),
  ('BE', 'Belgium', 'Europe', false),
  ('DE', 'Germany', 'Europe', false);

-- ---------------------------------------------------------------------------
-- Языки (Functional Spec §6)
-- ---------------------------------------------------------------------------

insert into languages (iso639_1, name) values
  ('en', 'English'),
  ('fr', 'French'),
  ('rw', 'Kinyarwanda'),
  ('sw', 'Swahili'),
  ('pt', 'Portuguese'),
  ('ar', 'Arabic');

-- ---------------------------------------------------------------------------
-- Области экспертизы
--
-- Источник даёт два пересекающихся списка: §5 (Areas of Expertise) и §6
-- (фасет Expertise). Объединены в двухуровневую иерархию: верхний уровень —
-- фасет поиска, нижний — конкретные области профиля.
-- ---------------------------------------------------------------------------

insert into expertise (slug, label) values
  ('education', 'Education'),
  ('technology', 'Technology'),
  ('health', 'Health'),
  ('engineering', 'Engineering'),
  ('business', 'Business'),
  ('agriculture', 'Agriculture'),
  ('environment', 'Environment'),
  ('law-and-policy', 'Law & Policy');

insert into expertise (slug, label, parent_id) values
  ('artificial-intelligence', 'Artificial Intelligence',
    (select id from expertise where slug = 'technology')),
  ('data-science', 'Data Science',
    (select id from expertise where slug = 'technology')),
  ('machine-learning', 'Machine Learning',
    (select id from expertise where slug = 'technology')),
  ('cybersecurity', 'Cybersecurity',
    (select id from expertise where slug = 'technology')),

  ('public-health', 'Public Health',
    (select id from expertise where slug = 'health')),
  ('epidemiology', 'Epidemiology',
    (select id from expertise where slug = 'health')),

  ('economics', 'Economics',
    (select id from expertise where slug = 'business')),
  ('development-studies', 'Development Studies',
    (select id from expertise where slug = 'business')),

  ('climate-change', 'Climate Change',
    (select id from expertise where slug = 'environment')),
  ('sustainability', 'Sustainability',
    (select id from expertise where slug = 'environment')),

  ('law', 'Law',
    (select id from expertise where slug = 'law-and-policy')),
  ('public-policy', 'Public Policy',
    (select id from expertise where slug = 'law-and-policy'));
