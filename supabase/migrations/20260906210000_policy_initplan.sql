-- Помощники прав вызываются один раз на запрос, а не один раз на строку.
--
-- current_user_role() и is_admin() объявлены stable, и это легко принять за обещание
-- «вычислится один раз». Обещание другое: stable значит лишь, что внутри одного запроса
-- результат не изменится. Вызывать функцию Postgres всё равно будет на каждую строку,
-- и каждый такой вызов — это отдельный запрос к public.users внутри security definer.
--
-- Обёртка (select ...) превращает вызов в InitPlan: подплан без ссылок на текущую строку
-- планировщик выполняет однажды и подставляет готовое значение в фильтр.
--
-- Цена измерена на 10 000 профилях, поиск по частому слову под ролью anon:
-- 192 мс до обёртки, 7,6 мс после. Двадцать пять раз, и не только в поиске — политика
-- experts_select_visible стоит на каждом чтении таблицы experts, включая кабинет
-- и страницу профиля. Бюджет §3 (p95 ≤ 300 мс) без этой правки не держится.
--
-- Почему в исходной миграции обёрнут только auth.uid(): приём известен по документации
-- Supabase именно в связке с auth.uid(), и там он выглядит частью идиомы, а не общим
-- правилом про stable-функции. Правило общее.
--
-- Обёрнуты не все вызовы. is_member_of(institution_id) и is_owner_of(id) принимают
-- колонку текущей строки, то есть коррелированы: InitPlan из них не получится, подплан
-- останется построчным, и (select ...) вокруг них не даёт ничего, кроме шума. Они
-- оставлены как есть — с ними надо разбираться по-другому, когда появятся команды (§2.5).

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

alter policy users_select_admin on public.users
  using ((select public.is_admin()));

alter policy users_update_own on public.users
  using (id = (select auth.uid()) and (select public.current_user_role()) is not null)
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- experts
-- ---------------------------------------------------------------------------

alter policy experts_select_admin on public.experts
  using ((select public.is_admin()));

alter policy experts_select_visible on public.experts
  using (
    deleted_at is null
    and published_at is not null
    and (
      profile_visibility = 'public'
      -- Проверяется роль, а не наличие сессии: у заблокированного пользователя
      -- сессия остаётся действительной до истечения токена, но прав у него нет.
      or (profile_visibility = 'authenticated' and (select public.current_user_role()) is not null)
    )
  );

alter policy experts_update_own on public.experts
  using (user_id = (select auth.uid()) and (select public.current_user_role()) is not null)
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- institutions, files, журналы
-- ---------------------------------------------------------------------------

alter policy institutions_select_all on public.institutions
  using (deleted_at is null or (select public.is_admin()));

alter policy files_select_own on public.files
  using (owner_user_id = (select auth.uid()) or (select public.is_admin()));

alter policy institution_members_select on public.institution_members
  using (public.is_member_of(institution_id) or (select public.is_admin()));

alter policy contact_disclosures_select on public.contact_disclosures
  using (public.is_member_of(institution_id) or (select public.is_admin()));

alter policy audit_log_select_admin on public.audit_log
  using ((select public.is_admin()));
