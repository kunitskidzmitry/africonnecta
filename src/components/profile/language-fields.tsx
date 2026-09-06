'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import { Field } from '@/components/register/field';
import { proficiencies, type Proficiency } from '@/lib/profile/schema';
import type { LanguageOption } from '@/lib/taxonomy-types';

export type LanguageRow = {
  languageId: string;
  proficiency: Proficiency | '';
};

/**
 * Ключ строки, а не индекс.
 *
 * По индексу React после удаления средней строки сопоставил бы состояние соседней
 * и оставил бы в ней чужой выбор. Начальные ключи выводятся из позиции, чтобы разметка
 * на сервере и после гидратации совпала; добавленные вручную строки получают счётчик.
 *
 * Значения строки — только начальные: сами <select> неуправляемые. Так сделано не для
 * краткости. React после серверного действия сам вызывает form.reset(), а сброс формы
 * возвращает <select> к пункту, помеченному в разметке. У управляемого списка выбор
 * живёт в пропсе value, разметка о нём не знает — и после первой же неудачной отправки
 * все языки визуально обнулялись, состояние React при этом оставалось прежним.
 * Расхождение было не косметическим: FormData читает DOM, поэтому следующая отправка
 * уходила без языков и упиралась в «добавьте хотя бы один язык» при трёх на экране.
 * defaultValue переживает reset правильно — ровно так же ведут себя страна, уровень
 * и видимость в этой же форме.
 */
type KeyedRow = LanguageRow & { key: string };

const blankRow = (key: string): KeyedRow => ({ key, languageId: '', proficiency: 'b2' });

export function LanguageFields({
  languages,
  initial,
  errorKey,
}: {
  languages: LanguageOption[];
  initial: LanguageRow[];
  errorKey?: string | undefined;
}) {
  const t = useTranslations('Profile');
  const nextKey = useRef(0);
  const [rows, setRows] = useState<KeyedRow[]>(() =>
    initial.length > 0
      ? initial.map((row, index) => ({ ...row, key: `initial-${index}` }))
      : [blankRow('initial-0')],
  );

  const addedKey = () => `added-${nextKey.current++}`;

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row, index) => (
        <div key={row.key} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
          <Field
            name={`languageId-${index}`}
            label={t('fieldLanguage')}
            errorKey={index === 0 ? errorKey : undefined}
          >
            {(props) => (
              <select {...props} name="languageId" defaultValue={row.languageId}>
                <option value="">{t('selectPlaceholder')}</option>
                {languages.map((language) => (
                  <option key={language.id} value={language.id}>
                    {language.name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field name={`proficiency-${index}`} label={t('fieldProficiency')}>
            {(props) => (
              <select {...props} name="proficiency" defaultValue={row.proficiency}>
                {proficiencies.map((level) => (
                  <option key={level} value={level}>
                    {t(`proficiency.${level}`)}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <div className="flex items-end">
            <button
              type="button"
              className="pb-2 text-sm text-slate-500 underline hover:text-slate-900"
              onClick={() => {
                // Последнюю строку не убираем, а очищаем: без единого <select name="languageId">
                // сервер не отличил бы «языков нет» от «поле не отправлено».
                setRows((current) =>
                  current.length === 1
                    ? [blankRow(addedKey())]
                    : current.filter((item) => item.key !== row.key),
                );
              }}
            >
              {t('removeLanguage')}
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="self-start text-sm font-semibold text-slate-900 underline"
        onClick={() => setRows((current) => [...current, blankRow(addedKey())])}
      >
        {t('addLanguage')}
      </button>
    </div>
  );
}
