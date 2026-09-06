/**
 * Замер серверного времени поиска против бюджета §3: p95 ≤ 300 мс.
 *
 * Меряется под ролью anon и authenticated, а не под postgres. Разница принципиальна:
 * у суперпользователя RLS не работает, поэтому замер «от postgres» показал бы время
 * запроса, которого в продакшене не бывает, и занижал бы результат ровно на стоимость
 * политик — то есть на то, что и надо проверить.
 *
 * Запуск: npm run bench:search [итераций]     (по умолчанию 40)
 */

import { Client } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Засеянный представитель институции: под ним видны профили 'authenticated'. */
const MEMBER = '22222222-2222-2222-2222-222222222222';

const iterations = Number(process.argv[2] ?? 40);

if (!Number.isInteger(iterations) || iterations < 5) {
  throw new Error('Число итераций — целое от 5');
}

const db = new Client({ connectionString: DATABASE_URL });
await db.connect();

async function catalogue() {
  const { rows: countries } = await db.query("select id from public.countries where iso2 = 'RW'");
  const { rows: expertise } = await db.query(
    'select id from public.expertise where parent_id is not null order by id limit 2',
  );
  const { rows: languages } = await db.query('select id from public.languages order by id limit 1');

  return {
    rwanda: countries[0].id,
    expertise: expertise.map((row) => row.id),
    language: languages[0].id,
  };
}

const { rwanda, expertise, language } = await catalogue();

/**
 * Формы запросов, которые встречаются в интерфейсе.
 *
 * Частое слово важнее редкого: по «health» полнотекстовый индекс возвращает тысячи
 * кандидатов, и именно там ранжирование стоит дороже всего. Замер только по редким
 * словам показывал бы красивые числа, не относящиеся к делу.
 */
const shapes = [
  { name: 'просмотр без фильтров', args: { page_size: 20 } },
  { name: 'частое слово (health)', args: { q: 'health', page_size: 20 } },
  { name: 'частое слово (learning)', args: { q: 'machine learning', page_size: 20 } },
  { name: 'редкое слово (epidemiology)', args: { q: 'epidemiology', page_size: 20 } },
  { name: 'слово + страна', args: { q: 'health', filter_country_ids: [rwanda], page_size: 20 } },
  { name: 'фасет области', args: { filter_expertise_ids: expertise, page_size: 20 } },
  { name: 'фасет языка', args: { filter_language_ids: [language], page_size: 20 } },
  {
    name: 'все фасеты вместе',
    args: {
      q: 'health',
      filter_country_ids: [rwanda],
      filter_levels: ['professor', 'lecturer'],
      filter_expertise_ids: expertise,
      filter_language_ids: [language],
      page_size: 20,
    },
  },
  /**
   * Запасные пути §10 меряются вместе с остальными, а не считаются редкими.
   *
   * На холодном старте пустая выдача — обычное дело, то есть обычен и путь после неё.
   * Поиск по написанию к тому же самый дорогой из всех: similarity() не leakproof,
   * поэтому под RLS триграммный индекс недостижим и сходство считается по каждой строке.
   * Форма «расширение области» — это два запроса подряд, точный и расширенный,
   * то есть ровно то, что делает runSearch на пустом результате.
   */
  { name: 'опечатка в институте', fn: 'similar', args: { q: 'Univerity of Rwana', page_size: 20 } },
  { name: 'опечатка в имени', fn: 'similar', args: { q: 'Habimanna Yves', page_size: 20 } },
  { name: 'расширение области', fn: 'broaden', args: { filter_expertise_ids: expertise } },
];

function sql(shape) {
  const args = shape.args;

  if (shape.fn === 'similar') {
    return {
      text: 'select * from public.search_experts_similar(q => $1, page_size => $2)',
      values: [args.q ?? null, args.page_size ?? 20],
    };
  }

  if (shape.fn === 'broaden') {
    return {
      text: 'select public.expertise_broaden($1)',
      values: [args.filter_expertise_ids ?? null],
    };
  }

  return {
    text: `select * from public.search_experts(
             q => $1, filter_country_ids => $2, filter_levels => $3, filter_expertise_ids => $4,
             filter_language_ids => $5, after_rank => $6, after_published_at => $7,
             after_id => $8, page_size => $9)`,
    values: [
      args.q ?? null,
      args.filter_country_ids ?? null,
      args.filter_levels ?? null,
      args.filter_expertise_ids ?? null,
      args.filter_language_ids ?? null,
      args.after_rank ?? null,
      args.after_published_at ?? null,
      args.after_id ?? null,
      args.page_size ?? 20,
    ],
  };
}

async function asRole(role, body) {
  await db.query('begin');
  try {
    if (role === 'anon') {
      await db.query("select set_config('request.jwt.claims', '', true)");
      await db.query('set local role anon');
    } else {
      await db.query(
        `select set_config('request.jwt.claims', '{"sub":"${MEMBER}","role":"authenticated"}', true)`,
      );
      await db.query('set local role authenticated');
    }

    return await body();
  } finally {
    await db.query('rollback');
  }
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  // Ближайший ранг: на сорока измерениях интерполяция создаёт видимость точности,
  // которой в них нет.
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);

  return sorted[Math.max(0, index)];
}

async function measure(role, shape) {
  const query = sql(shape);
  const samples = [];
  let rowCount = 0;

  // Прогревочные прогоны в статистику не идут: первый запрос платит за разбор плана
  // и за холодный кеш страниц, и в продакшене эта цена приходится на один запрос
  // из многих тысяч.
  for (let i = 0; i < 3; i += 1) await db.query(query);

  await asRole(role, async () => {
    for (let i = 0; i < iterations; i += 1) {
      const started = process.hrtime.bigint();
      const result = await db.query(query);
      const elapsed = Number(process.hrtime.bigint() - started) / 1e6;

      samples.push(elapsed);
      rowCount = result.rowCount;
    }
  });

  return {
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    max: Math.max(...samples),
    rows: rowCount,
  };
}

const { rows: counts } = await db.query(
  `select count(*) as total,
          count(*) filter (
            where deleted_at is null and published_at is not null
              and profile_visibility <> 'hidden'
          ) as searchable
   from public.experts`,
);

console.log(
  `Профилей в базе: ${counts[0].total}, доступно поиску: ${counts[0].searchable}. ` +
    `Итераций на форму: ${iterations}. Бюджет §3: p95 ≤ 300 мс.\n`,
);

let worst = 0;

for (const role of ['anon', 'authenticated']) {
  console.log(`— роль ${role} —`);

  for (const shape of shapes) {
    const { p50, p95, max, rows } = await measure(role, shape);

    worst = Math.max(worst, p95);
    console.log(
      `${shape.name.padEnd(30)} p50 ${p50.toFixed(1).padStart(6)} мс   ` +
        `p95 ${p95.toFixed(1).padStart(6)} мс   max ${max.toFixed(1).padStart(6)} мс   ` +
        `строк ${rows}`,
    );
  }

  console.log('');
}

console.log(
  worst <= 300
    ? `Бюджет соблюдён: худший p95 ${worst.toFixed(1)} мс из 300.`
    : `БЮДЖЕТ ПРЕВЫШЕН: худший p95 ${worst.toFixed(1)} мс против 300.`,
);

await db.end();

process.exitCode = worst <= 300 ? 0 : 1;
