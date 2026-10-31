/** How long after following a reset link the session may still set a new password. */
export const RECOVERY_WINDOW_SECONDS = 30 * 60;

type AuthMethodReference = { method?: unknown; timestamp?: unknown };

/**
 * True only for a session that was just created by a password reset email. A reset link signs the user in
 * with a one-time token (amr method "otp"), while a normal sign-in is "password" or "oauth", so a session
 * left open on a shared computer cannot be used to change the password without the reset link.
 */
export function isRecoverySession(
  claims: { amr?: unknown } | null | undefined,
  nowSeconds: number = Date.now() / 1000
): boolean {
  const references = Array.isArray(claims?.amr) ? (claims.amr as AuthMethodReference[]) : [];

  return references.some(
    (reference) =>
      reference.method === "otp" &&
      typeof reference.timestamp === "number" &&
      nowSeconds - reference.timestamp <= RECOVERY_WINDOW_SECONDS
  );
}
