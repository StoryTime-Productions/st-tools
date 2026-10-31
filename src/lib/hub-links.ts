import { Figma, Gamepad2, Github, HardDrive, Link2, Youtube } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const LINK_ICONS: Array<[RegExp, LucideIcon]> = [
  [/(^|\.)github\.com$/, Github],
  [/(^|\.)figma\.com$/, Figma],
  [/(^|\.)(youtube\.com|youtu\.be)$/, Youtube],
  [/^(drive|docs)\.google\.com$/, HardDrive],
  [/(^|\.)itch\.io$/, Gamepad2],
];

export function linkIcon(url: string): LucideIcon {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return Link2;
  }
  return LINK_ICONS.find(([pattern]) => pattern.test(host))?.[1] ?? Link2;
}

const LINK_LABELS: Array<[RegExp, string]> = [
  [/(^|\.)github\.com$/, "GitHub"],
  [/(^|\.)figma\.com$/, "Figma"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
  [/^(drive|docs)\.google\.com$/, "Google Drive"],
  [/(^|\.)itch\.io$/, "itch.io"],
];

/** A plain-text name for a link, for screen readers and tooltips. */
export function linkLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return LINK_LABELS.find(([pattern]) => pattern.test(host))?.[1] ?? "Link";
  } catch {
    return "Link";
  }
}
