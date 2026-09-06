import type { RegistrationErrorKey } from '@/lib/auth/registration-schema';

/**
 * Состояние формы регистрации.
 *
 * Вынесено из actions.ts намеренно. Файл с директивой 'use server' вправе экспортировать
 * только асинхронные функции: всё остальное Next считает ошибкой, потому что каждый
 * экспорт такого модуля становится вызываемой с клиента конечной точкой. Константа
 * начального состояния приезжала бы в форму как undefined.
 */
export type RegistrationState = {
  /** Ключ каталога RegisterErrors для конкретного поля. */
  fieldErrors: Record<string, RegistrationErrorKey>;
  /** Ключ каталога RegisterErrors для ошибки уровня формы. */
  formError: string | null;
};

export const emptyRegistrationState: RegistrationState = {
  fieldErrors: {},
  formError: null,
};
