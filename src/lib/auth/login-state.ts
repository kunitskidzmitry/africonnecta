export type LoginState = {
  fieldErrors: Record<string, string>;
  formError: string | null;
  email: string;
};

export const emptyLoginState: LoginState = {
  fieldErrors: {},
  formError: null,
  email: '',
};
