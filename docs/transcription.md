# AfriConnecta

> **Tagline:** Connecting Minds. Advancing Africa.

Расшифровка проектной документации из `AfriConnecta.pdf` (6 стр.) и `• Search & Filters.pdf` (1 стр.).
Оригиналы — фотографии распечатанных листов без текстового слоя. Пробелы и расхождения
источника отмечены блоками `> ⚠️` и не «додуманы». См. [Заметки о расшифровке](#заметки-о-расшифровке).

**Содержание**

1. [Concept Note](#1-concept-note)
2. [Full Software Requirements Specification (SRS)](#2-full-software-requirements-specification-srs)
3. [Software Requirements Specification (обзорная)](#3-software-requirements-specification-обзорная)
4. [Functional Specification (MVP & Roadmap)](#4-functional-specification-mvp--roadmap)
5. [Screens / UI](#5-screens--ui)
6. [Сводка: модель данных, API, алгоритм](#6-сводка-модель-данных-api-алгоритм)
7. [Заметки о расшифровке](#заметки-о-расшифровке)

---

## 1. Concept Note

### Executive Summary

AfriConnecta is an AI-powered academic expertise platform that connects universities, colleges,
research institutions, governments, NGOs, and international organizations with academic experts
from Africa and the African diaspora. Unlike traditional academic directories, AfriConnecta
combines verified academic expertise, African contextual knowledge and AI-driven expert matching.

### The Problem

African academic expertise is fragmented across universities, research institutions, diaspora
networks, LinkedIn, ORCID, ResearchGate and professional associations.

### The Opportunity

Africa has a fast-growing higher education sector, an expanding research ecosystem and a highly
skilled diaspora.

### Vision

To become Africa's leading platform for academic expertise, research collaboration, and knowledge
exchange.

### Mission

To make African academic expertise visible, accessible, and impactful.

### Core Value Proposition

> Expertise + African Context + Visibility.

### Key Innovation #1: African Context Score (TM)

Measures relevance to African realities, regional expertise, policy engagement, community impact
and research experience in Africa.

**Components:**

- Academic Engagement
- Geographical Expertise
- Policy & Development Experience
- Diaspora Contribution
- Language and Cultural Competency

_Example:_ Dr. Patrick Ufashingabo, African Context Score 92/100.

### Key Innovation #2: AI Expert Matching (TM)

AI identifies and ranks the most suitable experts based on expertise, credentials, regional
knowledge, research experience, African Context Score, languages and availability.

> ⚠️ Страница Concept Note обрывается на этом абзаце — продолжение (если есть) не сфотографировано.

---

## 2. Full Software Requirements Specification (SRS)

### 1. Vision

AfriConnecta is an Academic Intelligence Platform built around AI Expert Matching and the African
Context Score.

### 2. User Stories

| Роль            | Истории                                                  |
| --------------- | -------------------------------------------------------- |
| **Expert**      | create profile, manage publications, receive invitations |
| **Institution** | search experts, post opportunities, invite experts       |
| **Admin**       | verify users and manage analytics                        |

### 3. Wireframes

Screens: Landing Page, Login, Registration, Expert Dashboard, Institution Dashboard, Search
Results, Expert Profile, Opportunity Board, Messaging, Admin Portal.

### 4. ERD

```text
Users            -> ExpertProfiles
Institutions     -> Opportunities
Experts          -> Publications
Experts          -> Messages
Opportunities    -> Applications
```

### 5. Database Schema

Tables: `users`, `experts`, `institutions`, `expertise`, `publications`, `education`,
`opportunities`, `applications`, `messages`, `notifications`, `reviews`, `african_context_scores`.

### 6. REST APIs

```http
POST /auth/register
POST /auth/login
GET  /experts
GET  /experts/{id}
POST /opportunities
GET  /matches
POST /messages
```

### 7. AI Matching Algorithm

| Вес | Фактор                |
| --- | --------------------- |
| 40% | expertise             |
| 25% | African Context Score |
| 15% | research relevance    |
| 10% | language match        |
| 10% | availability          |

> ⚠️ Документ назван «Full SRS», но на листе есть только разделы 1–7. Разделы 8+ отсутствуют.

---

## 3. Software Requirements Specification (обзорная)

_Tagline: Connecting Minds. Advancing Africa._

### Project Overview

AI-powered academic intelligence platform connecting institutions with experts across Africa and
the diaspora.

### Business Objectives

Increase visibility of African talent, facilitate collaboration, and support knowledge exchange.

### User Roles

Academic Expert, Institution, Administrator.

### MVP Scope

Authentication, Expert Profiles, Institution Profiles, Search, Messaging, Verification.

### African Context Score

Scores experts based on African teaching, research, regional expertise, policy engagement,
language and diaspora contribution.

### AI Expert Matching

Ranks experts using expertise, context score, research relevance, language and availability.

### Search Engine

Advanced filtering by expertise, geography, language, availability and academic level.

### Opportunity Board

Guest lectures, research opportunities, conferences, mentorship and consulting.

---

## 4. Functional Specification (MVP & Roadmap)

> ⚠️ Лист начинается с раздела **4** и обрывается на разделе **8**, следующий лист начинается
> с раздела **14**. Разделы 1–3 и 9–13 в исходниках отсутствуют.

### 4. MVP Scope (Phase 1)

- **Feature 1: Registration**
- **Academic Registration Fields:** First Name, Last Name, Email, Phone, Country, Current
  Institution, Academic Title, Highest Degree, Biography, Profile Photo, CV Upload
- **Institution Registration Fields:** Organization Name, Type, Country, Website, Contact Person,
  Email, Phone

### 5. Expert Profile

- **Academic Information:** Name, Title, Institution, Country, Languages, Biography
- **Education:** Degree, University, Year
  - _Example:_ PhD Computer Science, University of Toronto, 2021
- **Areas of Expertise:** Artificial Intelligence, Public Health, Economics, Education, Climate
  Change, Cybersecurity, Law, Agriculture
- **African Experience:** Countries worked in, Years of experience, Research focus, Development
  experience, Policy experience
- **Availability:** Guest Lecturer, Research Partner, Mentor, Conference Speaker, Consultant,
  Thesis Supervisor

### 6. Search Engine

| Фильтр         | Значения                                                           |
| -------------- | ------------------------------------------------------------------ |
| Geography      | Rwanda, Kenya, Uganda, Nigeria, South Africa, All Africa, Diaspora |
| Expertise      | Education, AI, Health, Engineering, Business, Agriculture          |
| Language       | English, French, Kinyarwanda, Swahili, Portuguese, Arabic          |
| Availability   | Online, Hybrid, On-site                                            |
| Academic Level | Professor, Lecturer, Researcher, PhD Candidate                     |

### 7. Opportunity Board

Примеры объявлений:

- Looking for AI guest lecturer — Duration 2 hours, Location Kigali, Compensation $300
- Seeking thesis supervisors for Master Program Public Health (Remote)

### 8. Matching Engine

- **Basic Matching:** Expertise, Country, Language, Experience, Availability
- **Match Score Example:** 92%

### 14. Database Entities

- Users
- Experts
- Institutions
- Expertise
- Countries
- Languages
- Publications
- Education
- Experiences
- Opportunities
- Applications
- Messages
- Notifications
- Reviews

### 15. Future Roadmap

| Фаза                      | Содержание                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1 — Rwanda**      | 200 experts, 10 institutions, MVP launch                                                                                              |
| **Phase 2 — East Africa** | Rwanda, Kenya, Uganda, Tanzania                                                                                                       |
| **Phase 3 — Africa**      | Full Pan-African rollout                                                                                                              |
| **Phase 4 — Modules**     | Research Grants, Academic Jobs, Fellowship Listings, Conference Directory, Digital Mentorship, Expert Marketplace, AI Recommendations |

---

## 5. Screens / UI

### Список экранов (из `• Search & Filters.pdf`)

- Search & Filters
- Expert Profile
- Opportunity Board
- Messaging Center
- Analytics Dashboard
- Admin Console

> ⚠️ На листе только этот список — описания самих экранов отсутствуют.

### Institution Dashboard (макет, стр. 6 `AfriConnecta.pdf`)

Вид от лица институции (пользователь: Esther M., University of Rwanda, тариф Premium).

**Левый сайдбар:**

- Dashboard
- Find Experts
- Opportunities
- My Requests
- Messages
- Saved Experts
- _Institution:_ My Institution Profile, Team Members, Billing & Plans, Analytics
- _Support:_ Help Center, Guidelines, Contact Support
- CTA-блок: «Upgrade your plan» → Upgrade Now

**Hero-блок:**

> **Find African Expertise. Build Knowledge. Transform Futures.**
> AfriConnecta connects institutions with academic experts from Africa and the diaspora for
> teaching, research and collaboration.

Поисковая строка «What are you looking for?» (пример: _Public Health, Economics…_) + фильтры:
Expertise (Select expertise), Country / Region (All Countries), Availability (Online, Hybrid,
On-site) + кнопка Search. Быстрые теги: Artificial Intelligence, Public Health, Education,
Climate Change, Agriculture, Data Science.

**Метрики:**

| Показатель                                  | Значение |
| ------------------------------------------- | -------- |
| Academic Experts (Across Africa & Diaspora) | 2 458    |
| Institutions Connected                      | 386      |
| Collaborations Facilitated                  | 1 024    |
| Countries Represented                       | 54       |

**Featured Experts** (карточки с «View Profile» + «View all experts»):

| Эксперт            | Институция / страна                                     | Теги                           |
| ------------------ | ------------------------------------------------------- | ------------------------------ |
| Prof. James Mwangi | Professor of Data Science, University of Nairobi, Kenya | Data Science, Machine Learning |
| Dr. Amina Diallo   | Public Health Specialist, Makerere University, Uganda   | Public Health, Epidemiology    |
| Dr. Yves Habimana  | Lecturer in Economics, University of Rwanda             | Economics, Development, Policy |
| Dr. Ngozi Okafor   | Environmental Scientist, University of Cape Town, SA    | Climate Change, Sustainability |

**Recent Opportunities** (+ «View all opportunities»):

| Объявление                                   | Тип         | Институция                    | Локация      |
| -------------------------------------------- | ----------- | ----------------------------- | ------------ |
| Guest Lecturer in Artificial Intelligence    | Lectureship | Kigali, Rwanda                | —            |
| Thesis Supervisors — Public Health           | Supervision | African Leadership University | Rwanda       |
| Research Collaboration on Climate Adaptation | Research    | University of Ghana           | Accra, Ghana |

**Правая колонка:**

- Приветствие «Welcome back, Esther!», University of Rwanda, статус Premium (renews May 15, 2025)
- Notification plan / View Profile
- **Quick Actions:** Post an Opportunity (Find the right expert), Invite an Expert (Send a direct
  invitation), Shortlist Experts (Meet your saved experts), Browse All Experts (Explore the full
  network)
- **Upcoming Events:** AI in Healthcare Symposium — Virtual Event, 15 May 2025 · Higher Education
  Summit — Kigali, Rwanda, 20–22 June 2025

> ⚠️ Макет расшифрован с фотографии распечатки, повёрнутой на 90°. Мелкие подписи и часть дат
> читаются неуверенно — сверяйте с оригиналом перед использованием в вёрстке.

---

## 6. Сводка: модель данных, API, алгоритм

### Сущности (объединение двух списков)

| Сущность                      | Full SRS (§5, таблицы) | Functional Spec (§14) |
| ----------------------------- | ---------------------- | --------------------- |
| users / Users                 | ✅                     | ✅                    |
| experts / Experts             | ✅                     | ✅                    |
| institutions / Institutions   | ✅                     | ✅                    |
| expertise / Expertise         | ✅                     | ✅                    |
| publications / Publications   | ✅                     | ✅                    |
| education / Education         | ✅                     | ✅                    |
| opportunities / Opportunities | ✅                     | ✅                    |
| applications / Applications   | ✅                     | ✅                    |
| messages / Messages           | ✅                     | ✅                    |
| notifications / Notifications | ✅                     | ✅                    |
| reviews / Reviews             | ✅                     | ✅                    |
| african_context_scores        | ✅                     | ❌                    |
| Countries                     | ❌                     | ✅                    |
| Languages                     | ❌                     | ✅                    |
| Experiences                   | ❌                     | ✅                    |

### Матчинг

```text
match_score = 0.40 * expertise
            + 0.25 * african_context_score
            + 0.15 * research_relevance
            + 0.10 * language_match
            + 0.10 * availability
```

Базовые поля для матчинга (Functional Spec §8): Expertise, Country, Language, Experience,
Availability. Пример результата: 92%.

### African Context Score

Пять компонентов: Academic Engagement · Geographical Expertise · Policy & Development Experience ·
Diaspora Contribution · Language and Cultural Competency. Шкала 0–100 (пример: 92/100).

> ⚠️ Веса компонентов African Context Score в документах не заданы.

---

## Заметки о расшифровке

**Что отсутствует в исходниках:**

- Concept Note обрывается на разделе «Key Innovation #2».
- «Full SRS» содержит только разделы 1–7.
- Functional Specification: нет разделов 1–3 и 9–13 (лист начинается с §4, следующий — с §14).
- Раздел «Search & Filters» — только список из шести экранов без описаний.

**Расхождения между документами:**

- Списки сущностей БД различаются: `african_context_scores` есть только в Full SRS, а `Countries`,
  `Languages`, `Experiences` — только в Functional Spec.
- Два разных набора фильтров поиска: обзорная SRS описывает их абстрактно (expertise, geography,
  language, availability, academic level), Functional Spec §6 даёт конкретные значения.
- Списки экранов тоже расходятся: Full SRS §3 (Wireframes) перечисляет 10 экранов, включая Landing
  Page и Admin Portal; `• Search & Filters.pdf` — 6, включая Analytics Dashboard и Admin Console.

**Достоверность:** разделы 1–4 расшифрованы с хорошо читаемых сканов. Раздел 5 (макет дашборда) —
с фотографии повёрнутого листа, точность ниже.
