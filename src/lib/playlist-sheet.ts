import { parse } from "csv-parse/sync";

export interface WeekRow {
  weekNumber: number;
  status: string;
  entries: Record<string, string>;
}

export interface ParsedSheet {
  people: string[];
  weeks: WeekRow[];
}

const WEEK_LABEL_RE = /^Week\s+(\d+)\s*\(([^)]*)\)\s*$/i;
const DONE = "DONE";

export function getSheetUrl(sheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
}

export function parseSheet(csv: string): ParsedSheet {
  const rows: string[][] = parse(csv, { relax_column_count: true });

  const firstWeekRowIndex = rows.findIndex((row) => WEEK_LABEL_RE.test((row[0] ?? "").trim()));
  if (firstWeekRowIndex < 1) {
    throw new Error("Could not locate week rows in the playlist sheet");
  }

  const people = (rows[firstWeekRowIndex - 1] ?? [])
    .slice(1)
    .map((cell) => cell.trim())
    .filter((cell) => cell !== "");

  const weeks: WeekRow[] = [];
  for (const row of rows.slice(firstWeekRowIndex)) {
    const match = WEEK_LABEL_RE.exec((row[0] ?? "").trim());
    if (!match) continue;

    const entries: Record<string, string> = {};
    people.forEach((person, index) => {
      const cell = (row[index + 1] ?? "").trim();
      if (cell !== "") entries[person] = cell;
    });

    weeks.push({ weekNumber: Number(match[1]), status: (match[2] ?? "").trim(), entries });
  }

  return { people, weeks };
}

export function pickCurrentWeek(weeks: WeekRow[]): WeekRow | undefined {
  return weeks.find((week) => week.status.toUpperCase() !== DONE) ?? weeks[weeks.length - 1];
}
