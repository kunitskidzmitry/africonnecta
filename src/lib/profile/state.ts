export type ProfileState = {
  fieldErrors: Record<string, string>;
  formError: string | null;
  saved: boolean;
  /**
   * Счётчик удачных записей — он же key формы.
   *
   * defaultValue и useState читаются только при монтировании, поэтому после сохранения
   * форму нужно перемонтировать, иначе список языков останется с прежними строками.
   * Растёт исключительно при успехе: после ошибки форма обязана сохранить то, что
   * человек уже набрал.
   */
  revision: number;
};

export const emptyProfileState: ProfileState = {
  fieldErrors: {},
  formError: null,
  saved: false,
  revision: 0,
};
