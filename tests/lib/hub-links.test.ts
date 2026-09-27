import { describe, expect, it } from "vitest";
import { Figma, Gamepad2, Github, HardDrive, Link2, Youtube } from "lucide-react";
import { linkIcon } from "@/lib/hub-links";

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
