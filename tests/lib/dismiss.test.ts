import { describe, expect, it } from "vitest";
import { keepOpenForInlineEdit } from "@/lib/dismiss";

function escapeFrom(target: EventTarget | null) {
  const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
  Object.defineProperty(event, "target", { value: target });
  keepOpenForInlineEdit(event);
  return event.defaultPrevented;
}

describe("keepOpenForInlineEdit", () => {
  it("only blocks dismissal when Escape starts inside an inline editor", () => {
    const wrapper = document.createElement("div");
    wrapper.dataset.inlineEdit = "";
    const input = document.createElement("input");
    wrapper.appendChild(input);

    expect(escapeFrom(input)).toBe(true);
    expect(escapeFrom(document.createElement("button"))).toBe(false);
    expect(escapeFrom(null)).toBe(false);
  });
});
