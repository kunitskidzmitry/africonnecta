import 'server-only';

import { inspectUpload, storageKey, type FileKind, type FileRejection } from '@/lib/files/format';
import { stripMetadata } from '@/lib/files/metadata';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';

export const FILES_BUCKET = 'expert-files';

/**
 * Патч профиля с новым файлом этого вида.
 *
 * Ветвление, а не вычисляемый ключ `{ [column]: fileId }`: у вычисляемого тип
 * вырождается в `{ [x: string]: string }`, и сгенерированные типы Supabase перестают
 * проверять, что колонка вообще существует. Опечатка в имени колонки тогда доходит
 * до базы вместо того, чтобы упасть на сборке.
 */
function attachment(kind: FileKind, fileId: string | null) {
  return kind === 'photo' ? { photo_file_id: fileId } : { cv_file_id: fileId };
}

export type FileFailure =
  | FileRejection
  /** Сигнатура правильная, а структура не разбирается — то есть файл битый или собран вручную. */
  | { reason: 'malformed' }
  | { reason: 'storage' };

export type FileOutcome = { ok: true } | { ok: false; failure: FileFailure };

/**
 * Заменяет файл профиля на новый.
 *
 * Порядок шагов — тот же приём, что в ADR-0006: сначала появляется новое целое состояние,
 * потом убирается старое. Обрыв на любом шаге оставляет профиль с прежним файлом либо
 * с новым, но никогда без файла и никогда со ссылкой в пустоту.
 *
 * Сначала загрузка в хранилище и строка в базе, затем привязка к профилю, и только после
 * неё удаление прежнего файла. Обратный порядок (сначала убрать старый) оставлял бы
 * профиль без фотографии при любом сбое посередине, а орфан в хранилище — беда меньшая:
 * его никто не видит, потому что политика чтения требует строку в public.files.
 *
 * Привязка делается клиентом пользователя, а не служебным: право на правку профиля
 * проверяет политика experts_update_own, и обходить её незачем — служебный ключ нужен
 * ровно для того, что иначе невозможно (запись файла), и ни для чего больше.
 */
export async function replaceProfileFile(params: {
  userId: string;
  expertId: string;
  kind: FileKind;
  bytes: Uint8Array;
}): Promise<FileOutcome> {
  const { userId, expertId, kind, bytes } = params;

  const inspected = inspectUpload(bytes, kind);

  if ('rejected' in inspected) return { ok: false, failure: inspected.rejected };

  const cleaned = stripMetadata(bytes, inspected.format);

  if (!cleaned) return { ok: false, failure: { reason: 'malformed' } };

  const service = createServiceClient();
  const supabase = await createClient();

  const previous = await currentFileId(expertId, kind);

  const fileId = crypto.randomUUID();
  const key = storageKey(userId, kind, fileId, inspected.format);

  const { error: uploadError } = await service.storage
    .from(FILES_BUCKET)
    .upload(key, cleaned, { contentType: inspected.format.mime, upsert: false });

  if (uploadError) return { ok: false, failure: { reason: 'storage' } };

  const { error: rowError } = await service.from('files').insert({
    id: fileId,
    owner_user_id: userId,
    storage_key: key,
    kind,
    mime_type: inspected.format.mime,
    size_bytes: cleaned.byteLength,
  });

  if (rowError) {
    // Объект без строки недостижим ни для кого, но и незачем: убираем сразу.
    await service.storage.from(FILES_BUCKET).remove([key]);
    return { ok: false, failure: { reason: 'storage' } };
  }

  const { error: attachError } = await supabase
    .from('experts')
    .update(attachment(kind, fileId))
    .eq('id', expertId);

  if (attachError) {
    await removeFile(fileId, key);
    return { ok: false, failure: { reason: 'storage' } };
  }

  if (previous) await removeFile(previous.id, previous.storage_key);

  return { ok: true };
}

/**
 * Снимает файл с профиля и удаляет его.
 *
 * Порядок обратный загрузке и по той же причине: сначала профиль перестаёт ссылаться
 * на файл, потом файл исчезает. Внешний ключ объявлен `on delete set null`, так что
 * удаление сработало бы и без первого шага, но тогда между двумя запросами существовал
 * бы момент, когда строка уже удалена, а страница ещё её показывает.
 */
export async function removeProfileFile(params: {
  expertId: string;
  kind: FileKind;
}): Promise<FileOutcome> {
  const { expertId, kind } = params;

  const existing = await currentFileId(expertId, kind);

  if (!existing) return { ok: true };

  const supabase = await createClient();

  const { error } = await supabase
    .from('experts')
    .update(attachment(kind, null))
    .eq('id', expertId);

  if (error) return { ok: false, failure: { reason: 'storage' } };

  await removeFile(existing.id, existing.storage_key);

  return { ok: true };
}

/**
 * Прежний файл этого вида, если он есть.
 *
 * Читается служебным клиентом: колонка experts.cv_file_id отобрана у клиентских ролей
 * на уровне грантов (§7), поэтому обычным клиентом её не спросить даже владельцу.
 */
async function currentFileId(
  expertId: string,
  kind: FileKind,
): Promise<{ id: string; storage_key: string } | null> {
  const service = createServiceClient();

  const { data } = await service
    .from('experts')
    .select('photo_file_id, cv_file_id')
    .eq('id', expertId)
    .maybeSingle();

  const fileId = kind === 'photo' ? data?.photo_file_id : data?.cv_file_id;

  if (!fileId) return null;

  const { data: file } = await service
    .from('files')
    .select('id, storage_key')
    .eq('id', fileId)
    .maybeSingle();

  return file ?? null;
}

async function removeFile(fileId: string, key: string): Promise<void> {
  const service = createServiceClient();

  await service.storage.from(FILES_BUCKET).remove([key]);
  await service.from('files').delete().eq('id', fileId);
}
