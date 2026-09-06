import { getTranslations } from 'next-intl/server';

import type { SearchResultRow } from '@/lib/search/run';

type Props = {
  row: SearchResultRow;
  countryNames: Map<number, string>;
  expertiseLabels: Map<number, string>;
  languageNames: Map<number, string>;
};

/**
 * Карточка в списке выдачи.
 *
 * Контактов здесь нет и быть не может: функция поиска их не возвращает (§7), поэтому
 * компонент физически не располагает данными, которые запрещено показывать. Это и было
 * смыслом решения держать список и раскрытие контактов разными путями — правило
 * соблюдается устройством кода, а не памятью того, кто правит вёрстку.
 */
export async function ExpertCard({ row, countryNames, expertiseLabels, languageNames }: Props) {
  const t = await getTranslations('Search');
  const tProfile = await getTranslations('Profile');

  const country = row.countryId === null ? null : countryNames.get(row.countryId);
  const areas = row.expertiseIds
    .map((id) => expertiseLabels.get(id))
    .filter((label): label is string => label !== undefined);
  const languages = row.languageIds
    .map((id) => languageNames.get(id))
    .filter((name): name is string => name !== undefined);

  const affiliation = [row.institution, country].filter(Boolean).join(', ');

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-slate-200 p-5">
      {/* Фотография приходит через /api/files/[id]: право проверяет политика, а адрес
          объекта в разметке не появляется — подпись живёт минуты и зависит от того,
          кто смотрит. По той же причине не next/image: за редиректом на чужой домен
          оптимизировать нечего.

          alt пустой намеренно. Имя стоит рядом заголовком, и «фотография такого-то»
          читалось бы экранным диктором дважды; для оформительной картинки правильный
          alt — пустой. */}
      <div className="flex items-start gap-4">
        {row.photoFileId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/files/${row.photoFileId}`}
            alt=""
            loading="lazy"
            className="size-14 shrink-0 rounded-full object-cover"
          />
        ) : null}

        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-slate-900">
            {row.firstName} {row.lastName}
          </h3>

          <p className="text-sm text-slate-600">
            {[row.title, row.academicLevel ? tProfile(`level.${row.academicLevel}`) : null]
              .filter(Boolean)
              .join(' · ')}
          </p>

          {affiliation ? <p className="text-sm text-slate-500">{affiliation}</p> : null}
        </div>
      </div>

      {row.bioExcerpt ? <p className="text-sm text-slate-700">{row.bioExcerpt}</p> : null}

      {areas.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {areas.map((area) => (
            <li
              key={area}
              className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700"
            >
              {area}
            </li>
          ))}
        </ul>
      ) : null}

      {languages.length > 0 ? (
        <p className="text-xs text-slate-500">
          {t('speaks')}: {languages.join(', ')}
        </p>
      ) : null}
    </article>
  );
}
