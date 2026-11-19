/** OTP names agencies in full ("Société de transport de Montréal"); riders know them by their short names. */
export function shortAgency(agency: string | undefined) {
  if (!agency) return undefined;
  if (/soci[eé]t[eé] de transport de montr[eé]al/i.test(agency)) return "STM";
  return agency;
}

/** "STM 80", or the mode when OTP gave neither agency nor line. */
export function lineName(leg: { mode: string; agency?: string; line?: string }) {
  return [shortAgency(leg.agency), leg.line].filter(Boolean).join(" ") || leg.mode.toLowerCase();
}
