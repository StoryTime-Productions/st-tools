export function parseContributors(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return map;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return map;

  const entries = Object.entries(parsed);
  if (entries.some(([, column]) => typeof column !== "string" || column.trim() === "")) {
    return map;
  }
  for (const [discordId, column] of entries) map.set(discordId, (column as string).trim());
  return map;
}

export function getContributorColumn(
  discordId: string | null | undefined,
  raw: string | undefined = process.env.PLAYLIST_CONTRIBUTORS
): string | null {
  if (!discordId) return null;
  return parseContributors(raw).get(discordId) ?? null;
}
