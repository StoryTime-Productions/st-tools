import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  TimerSettingsCard,
  type Durations,
  type TimerPrefs,
} from "@/app/timer/_components/timer-settings-card";

const saved: Durations = { workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15 };
const prefs: TimerPrefs = {
  focusColor: "#3b82f6",
  breakColor: "#f97316",
  interpolatePhaseColors: true,
  autoStartBreaks: false,
  autoStartFocus: false,
  soundEnabled: true,
};

function renderCard(overrides?: { draft?: Durations; isSaving?: boolean }) {
  const handlers = {
    onDraftChange: vi.fn(),
    onSave: vi.fn(),
    onPrefsChange: vi.fn(),
  };

  render(
    <TimerSettingsCard
      saved={saved}
      draft={overrides?.draft ?? saved}
      isSaving={overrides?.isSaving ?? false}
      prefs={prefs}
      {...handlers}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: /Timer settings/ }));

  return handlers;
}

describe("TimerSettingsCard", () => {
  it("starts collapsed and reveals the panel via an aria-expanded disclosure", () => {
    render(
      <TimerSettingsCard
        saved={saved}
        draft={saved}
        isSaving={false}
        prefs={prefs}
        onDraftChange={vi.fn()}
        onSave={vi.fn()}
        onPrefsChange={vi.fn()}
      />
    );
    const toggle = screen.getByRole("button", { name: /Timer settings/ });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Work")).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", "timer-settings-panel");
    expect(screen.getByLabelText("Work")).toBeInTheDocument();
  });

  it("groups controls into named fieldsets and shows each range as helper text", () => {
    renderCard();

    expect(screen.getByRole("group", { name: "Durations" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Behavior" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByText("1–90 min")).toBeInTheDocument();
    expect(screen.getByText("1–30 min")).toBeInTheDocument();
    expect(screen.getByText("5–60 min")).toBeInTheDocument();
  });

  it("disables Save until a valid change exists", () => {
    renderCard();

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("enables Save and flags unsaved changes for a valid edit", () => {
    const { onSave } = renderCard({ draft: { ...saved, workMinutes: 30 } });

    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeEnabled();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("keeps Save disabled and shows a specific message once an invalid field is blurred", () => {
    renderCard({ draft: { ...saved, longBreakMinutes: 2 } });
    const longBreak = screen.getByLabelText("Long break");

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(longBreak).toHaveAttribute("aria-invalid", "false");

    fireEvent.blur(longBreak);

    expect(longBreak).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText("Must be 5–60 min")).toHaveLength(1);
  });

  it("reports duration and preference changes to the parent", () => {
    const { onDraftChange, onPrefsChange } = renderCard();

    fireEvent.change(screen.getByLabelText("Short break"), { target: { value: "7" } });
    fireEvent.click(screen.getByLabelText("Auto-start breaks"));
    fireEvent.click(screen.getByLabelText("Blend colors as time runs down"));
    fireEvent.click(screen.getByLabelText("Sound cues"));

    expect(onDraftChange).toHaveBeenCalledWith("shortBreakMinutes", 7);
    expect(onPrefsChange).toHaveBeenCalledWith({ autoStartBreaks: true });
    expect(onPrefsChange).toHaveBeenCalledWith({ interpolatePhaseColors: false });
    expect(onPrefsChange).toHaveBeenCalledWith({ soundEnabled: false });
  });

  it("shows a saving state and blocks Save while saving", () => {
    renderCard({ draft: { ...saved, workMinutes: 30 }, isSaving: true });

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
  });
});
