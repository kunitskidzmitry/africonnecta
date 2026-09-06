import { NextResponse } from 'next/server';

import { FILES_BUCKET } from '@/lib/files/store';
import { createClient } from '@/lib/supabase/server';

/**
 * Отдача файла по подписанной ссылке.
 *
 * Обработчик не отдаёт байты сам, а перенаправляет на подписанную ссылку хранилища.
 * Так выполняется требование §7 «отдача с отдельного домена»: содержимое приходит
 * с домена Supabase, а не с нашего, и файл, оказавшийся не тем, чем притворяется,
 * исполняется в чужом источнике, где ни наших куки, ни нашего DOM нет.
 *
 * Право проверяет не этот код, а политика. Строка файла и объект читаются клиентом
 * пользователя (или гостя), и подписать ссылку хранилище согласится ровно тогда, когда
 * политика expert_files_select пропустит объект — то есть когда пропустит и строку
 * (миграция 20260906230000). Отсутствие права и отсутствие файла отвечают одинаковым
 * 404: иначе перебором идентификаторов можно выяснять, у кого какой файл есть.
 *
 * Служебный ключ здесь не используется намеренно, хотя подписать им проще: тогда
 * единственным замком стал бы этот файл, а сейчас замок — политика.
 */

/** Пока живёт подписанная ссылка. */
const TTL_SECONDS = { photo: 600, cv: 60 } as const;

/**
 * Пока браузер имеет право переиспользовать сам редирект.
 *
 * Строго меньше времени жизни ссылки, иначе кешированный редирект однажды приведёт
 * на просроченную подпись. Фотография в выдаче поиска повторяется на каждой странице,
 * и без кеша каждый её показ стоил бы запроса к базе и подписи.
 *
 * private, а не public: адрес зависит от того, кто смотрит, и общему кешу его отдавать
 * нельзя. У CV кеша нет вовсе — раскрытие контактов считается по квоте (§9), и хранить
 * ссылку на чужое CV в кеше браузера незачем.
 */
const CACHE = { photo: 'private, max-age=300', cv: 'no-store' } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  if (!UUID.test(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const supabase = await createClient();

  const { data: file } = await supabase
    .from('files')
    .select('storage_key, kind, owner_user_id')
    .eq('id', id)
    .maybeSingle();

  if (!file) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const kind = file.kind;

  const { data, error } = await supabase.storage
    .from(FILES_BUCKET)
    .createSignedUrl(file.storage_key, TTL_SECONDS[kind], {
      // Content-Disposition: attachment для CV (§7). Фотография остаётся inline —
      // иначе её нечем показать в карточке, а тег img скачанный файл не отрисует.
      // Защита фотографии в другом: структура разобрана при загрузке, дописанное
      // за концом изображения отброшено, и отдаётся она с чужого домена.
      ...(kind === 'cv' ? { download: await cvFileName(supabase, file.owner_user_id) } : {}),
    });

  if (error || !data) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const response = NextResponse.redirect(data.signedUrl, 307);
  response.headers.set('Cache-Control', CACHE[kind]);

  return response;
}

/**
 * Имя файла при скачивании.
 *
 * Без него институция, скачавшая пять CV, получает cv.pdf, cv-1.pdf и далее — то есть
 * теряет ровно ту информацию, за которую платила квотой. Профиль здесь уже виден
 * (иначе подпись бы не состоялась), поэтому лишнего запрос не открывает.
 */
async function cvFileName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerUserId: string,
): Promise<string> {
  const { data } = await supabase
    .from('experts')
    .select('first_name, last_name')
    .eq('user_id', ownerUserId)
    .maybeSingle();

  if (!data) return 'cv.pdf';

  const slug = `${data.first_name}-${data.last_name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return slug ? `${slug}-cv.pdf` : 'cv.pdf';
}
