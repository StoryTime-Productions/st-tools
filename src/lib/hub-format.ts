export function formatQuarter(quarter: string): string {
  const [year, q] = quarter.split("-");
  return `${q} ${year}`;
}

export function formatQuarterRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  if (!end || end === start) return formatQuarter(start);
  return `${formatQuarter(start)} – ${formatQuarter(end)}`;
}

export function quarterOptions(now = new Date()): string[] {
  const year = now.getFullYear();
  const options: string[] = [];
  for (let y = year - 1; y <= year + 2; y += 1) {
    for (let q = 1; q <= 4; q += 1) {
      options.push(`${y}-Q${q}`);
    }
  }
  return options;
}

export function projectInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
