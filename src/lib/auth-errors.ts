export const CALLBACK_ERRORS = {
  email: "We couldn't find an email for this account.",
  sync: "We couldn't set up your account. Try again.",
  confirm: "We couldn't confirm your account. Request a new link and try again.",
  expired: "That reset link has expired or was already used. Request a new one.",
} as const;

/** Returned by the reset action when the recovery session is gone; the form offers a new link for it. */
export const RESET_LINK_EXPIRED = "This reset link has expired. Request a new one.";

export type CallbackErrorCode = keyof typeof CALLBACK_ERRORS;

/** Fixed message for a known `?error=` code, otherwise null, so a crafted link can never print its own text. */
export function callbackErrorMessage(code: string | null): string | null {
  return code !== null && Object.prototype.hasOwnProperty.call(CALLBACK_ERRORS, code)
    ? CALLBACK_ERRORS[code as CallbackErrorCode]
    : null;
}
