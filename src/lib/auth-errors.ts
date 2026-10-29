export const CALLBACK_ERRORS = {
  email: "We couldn't find an email for this account.",
  sync: "We couldn't set up your account. Try again.",
  confirm: "We couldn't confirm your account. Request a new link and try again.",
} as const;

export type CallbackErrorCode = keyof typeof CALLBACK_ERRORS;

/** Fixed message for a known `?error=` code, otherwise null, so a crafted link can never print its own text. */
export function callbackErrorMessage(code: string | null): string | null {
  return code !== null && Object.prototype.hasOwnProperty.call(CALLBACK_ERRORS, code)
    ? CALLBACK_ERRORS[code as CallbackErrorCode]
    : null;
}
