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
