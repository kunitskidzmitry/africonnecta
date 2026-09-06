import { NextResponse } from 'next/server';

import { getPathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getAppSession } from '@/lib/auth/session';
import { parseFileKind } from '@/lib/files/feedback';
import { MAX_BYTES, type FileKind } from '@/lib/files/format';
import { removeProfileFile, replaceProfileFile } from '@/lib/files/store';

/**
 * Загрузка и удаление фотографии и CV.
 *
 * Обработчик маршрута, а не server action, по двум причинам.
 *
 * Первая: у server action размер тела ограничен одним мегабайтом, и поднимается предел
 * только глобально (serverActions.bodySizeLimit), то есть заодно для входа и сохранения
 * профиля — форм, которым большое тело не нужно никогда. Предел на файлы держится там,
 * где он про файлы.
 *
 * Вторая: обычная форма method="post" с enctype="multipart/form-data" работает без
 * JavaScript, а ответ 303 возвращает браузер на страницу профиля обычной навигацией.
 *
 * Цена решения: /api исключён из proxy.ts (config.matcher), поэтому проверку источника
 * и предел на тело server action сделал бы за нас, а здесь они написаны руками.
 * Разбор в ADR-0008.
 *
 * Вид файла и локаль приходят из строки запроса, а не полем формы: при method="post"
 * браузер сохраняет query из action, зато поля формы читаются только вместе с телом.
 * Из адреса они известны до чтения тела — и отказ по размеру попадает на страницу
 * нужным сообщением вместо голого 413.
 */

/** 303, а не 302: браузер обязан сменить POST на GET, иначе обновление страницы повторит загрузку. */
const SEE_OTHER = 303;

/**
 * Запас над лимитом файла: границы частей multipart и заголовки полей тоже считаются
 * в длину тела. Килобайта хватает с избытком — в теле одно поле.
 */
const ENVELOPE_BYTES = 1024;

/**
 * Запрос пришёл с нашей страницы.
 *
 * Server action такую проверку делает сам, обработчик маршрута — нет. Куки Supabase
 * помечены SameSite=Lax, и межсайтовый POST их уже не донесёт, но полагаться на одну
 * настройку куки в единственном месте, где чужой сайт мог бы что-то записать от имени
 * пользователя, не стоит.
 */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');

  if (!origin) return false;

  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

/**
 * Локаль из адреса — только из списка поддерживаемых.
 *
 * Иначе редирект уводил бы на несуществующий префикс, и человек вместо своей страницы
 * получал бы 404 с потерянным файлом.
 */
function localeFrom(params: URLSearchParams): string {
  const value = params.get('locale');
  const known = (routing.locales as readonly string[]).includes(value ?? '');

  return known && value ? value : routing.defaultLocale;
}

function back(request: Request, locale: string, query: Record<string, string>): NextResponse {
  const url = new URL(getPathname({ href: '/profile', locale }), request.url);

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url, SEE_OTHER);
}

/**
 * Тело формы с жёстким пределом.
 *
 * request.formData() читает столько, сколько пришлют. Заголовок Content-Length здесь
 * не защита: он необязателен, и при chunked-передаче его просто нет, а браузер — не
 * единственный, кто умеет отправлять POST. Без предела один вошедший пользователь
 * укладывает процесс, отправив поток без конца; на одном небольшом инстансе (§2.2)
 * это вся платформа сразу.
 *
 * Поток пересобирается в новый Response с теми же заголовками: разбирать multipart
 * самостоятельно ради счётчика байт незачем, а Response.formData() — тот же разбор,
 * что и у запроса.
 */
async function boundedFormData(
  request: Request,
  limit: number,
): Promise<{ form: FormData } | { failed: 'tooLarge' | 'malformed' }> {
  if (!request.body) return { failed: 'malformed' };

  let seen = 0;
  let overflowed = false;

  const counted = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;

        if (seen > limit) {
          overflowed = true;
          controller.error(new Error('body too large'));
          return;
        }

        controller.enqueue(chunk);
      },
    }),
  );

  try {
    const contentType = request.headers.get('content-type');

    const form = await new Response(counted, {
      headers: contentType ? { 'content-type': contentType } : undefined,
    }).formData();

    return { form };
  } catch {
    // Разбор сорвался либо потому, что мы сами оборвали поток, либо потому, что тело
    // не multipart. Человеку это разные советы: уменьшить файл или пересохранить его.
    return { failed: overflowed ? 'tooLarge' : 'malformed' };
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'cross-origin request' }, { status: 403 });
  }

  const session = await getAppSession();

  if (!session || session.status !== 'active' || session.role !== 'expert' || !session.expertId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const locale = localeFrom(params);
  const kind = parseFileKind(params.get('kind'));

  // Вид файла собирает наша же разметка. Незнакомое значение — не ошибка человека,
  // показывать её ему на странице бессмысленно.
  if (!kind) {
    return NextResponse.json({ error: 'unknown file kind' }, { status: 400 });
  }

  if (params.get('intent') === 'remove') {
    const removed = await removeProfileFile({ expertId: session.expertId, kind });

    return removed.ok
      ? back(request, locale, { file: kind })
      : back(request, locale, { fileError: removed.failure.reason, fileKind: kind });
  }

  return uploadFile(request, locale, kind, {
    userId: session.userId,
    expertId: session.expertId,
  });
}

async function uploadFile(
  request: Request,
  locale: string,
  kind: FileKind,
  who: { userId: string; expertId: string },
): Promise<NextResponse> {
  const limit = MAX_BYTES[kind] + ENVELOPE_BYTES;
  const declared = Number(request.headers.get('content-length') ?? 0);

  // Отдельная ветка на объявленную длину: незачем читать поток целиком, чтобы затем
  // отказать по размеру, который прислали в первом же заголовке.
  if (declared > limit) {
    return back(request, locale, { fileError: 'tooLarge', fileKind: kind });
  }

  const body = await boundedFormData(request, limit);

  if ('failed' in body) {
    return back(request, locale, { fileError: body.failed, fileKind: kind });
  }

  const upload = body.form.get('file');

  if (!(upload instanceof File)) {
    return back(request, locale, { fileError: 'empty', fileKind: kind });
  }

  const outcome = await replaceProfileFile({
    ...who,
    kind,
    bytes: new Uint8Array(await upload.arrayBuffer()),
  });

  return outcome.ok
    ? back(request, locale, { file: kind })
    : back(request, locale, { fileError: outcome.failure.reason, fileKind: kind });
}
