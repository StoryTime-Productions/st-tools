import { describe, expect, it } from "vitest";
import { Figma, Gamepad2, Github, HardDrive, Link2, Youtube } from "lucide-react";
import { linkIcon, linkLabel } from "@/lib/hub-links";

describe("linkIcon", () => {
  it.each([
    ["https://github.com/StoryTime-Productions/st-tools", Github],
    ["https://www.figma.com/file/abc", Figma],
    ["https://youtu.be/xyz", Youtube],
    ["https://www.youtube.com/@storytime", Youtube],
    ["https://docs.google.com/document/d/1", HardDrive],
    ["https://storytime.itch.io/game", Gamepad2],
    ["https://example.com", Link2],
    ["not a url", Link2],
  ])("maps %s", (url, icon) => {
    expect(linkIcon(url)).toBe(icon);
  });
});

describe("linkLabel", () => {
  it.each([
    ["https://github.com/x", "GitHub"],
    ["https://www.figma.com/file/abc", "Figma"],
    ["https://youtu.be/xyz", "YouTube"],
    ["https://drive.google.com/x", "Google Drive"],
    ["https://storytime.itch.io/game", "itch.io"],
    ["https://example.com", "Link"],
    ["not a url", "Link"],
  ])("names %s", (url, label) => {
    expect(linkLabel(url)).toBe(label);
  });
});
