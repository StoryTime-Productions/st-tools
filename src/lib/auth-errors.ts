/** Shown when the allowlist trigger refused the account: its own `email_not_allowed` reason came through. */
export const NOT_ALLOWED = "That email isn't on the StoryTime list. Ask an admin to add it.";

/** Supabase wraps ANY failed account insert as "Database error saving new user", so this cannot blame the list alone. */
export const NOT_ALLOWED_OR_FAILED =
  "We couldn't create your account. If your email should be on the StoryTime list, ask an admin to add it; otherwise try again later.";

/** Which refusal message fits this Supabase error text, or null when it is not about account creation. */
export function accountRefusalMessage(text: string | null | undefined) {
  if (!text) return null;
  if (text.includes("email_not_allowed")) return NOT_ALLOWED;
  if (text.includes("saving new user")) return NOT_ALLOWED_OR_FAILED;
  return null;
}

export const CALLBACK_ERRORS = {
  email: "We couldn't find an email for this account.",
  sync: "We couldn't set up your account. Try again.",
  confirm: "We couldn't confirm your account. Request a new link and try again.",
  notAllowed: NOT_ALLOWED,
  accountFailed: NOT_ALLOWED_OR_FAILED,
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
