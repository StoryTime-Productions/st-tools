import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { playCompletionTone } from "@/app/timer/_components/timer-audio";
import {
  TimerSettingsCard,
  type Durations,
  type TimerPrefs,
} from "@/app/timer/_components/timer-settings-card";

vi.mock("@/app/timer/_components/timer-audio", () => ({ playCompletionTone: vi.fn() }));

const saved: Durations = { workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15 };
const prefs: TimerPrefs = {
  focusColor: "#3b82f6",
  breakColor: "#f97316",
  interpolatePhaseColors: true,
  autoStartBreaks: false,
  autoStartFocus: false,
  soundEnabled: true,
  notificationsEnabled: false,
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

describe("TimerSettingsCard additions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function renderOpen(
    overrides?: Partial<React.ComponentProps<typeof TimerSettingsCard>>,
    customPrefs: TimerPrefs = prefs
  ) {
    render(
      <TimerSettingsCard
        saved={saved}
        draft={saved}
        isSaving={false}
        prefs={customPrefs}
        onDraftChange={vi.fn()}
        onSave={vi.fn()}
        onPrefsChange={vi.fn()}
        {...overrides}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Timer settings/ }));
  }

  it("exposes toggles as switches and plays a test sound on demand", () => {
    renderOpen();
    expect(screen.getAllByRole("switch").length).toBeGreaterThanOrEqual(5);

    fireEvent.click(screen.getByRole("button", { name: "Test sound" }));
    expect(playCompletionTone).toHaveBeenCalledTimes(1);
  });

  it("disables notifications with an inline reason when the browser blocks them", () => {
    vi.stubGlobal("Notification", { permission: "denied" });
    renderOpen();

    expect(screen.getByLabelText("Browser notifications")).toBeDisabled();
    expect(screen.getByText("Blocked in your browser settings")).toBeInTheDocument();
  });

  it("says when the browser does not support notifications", () => {
    vi.stubGlobal("Notification", undefined);
    renderOpen();

    expect(screen.getByLabelText("Browser notifications")).toBeDisabled();
    expect(screen.getByText("Not supported in this browser")).toBeInTheDocument();
  });

  it("lets a user who already enabled notifications turn them off even if blocked later", () => {
    vi.stubGlobal("Notification", { permission: "denied" });
    renderOpen(undefined, { ...prefs, notificationsEnabled: true });

    expect(screen.getByLabelText("Browser notifications")).toBeEnabled();
  });

  it("locks the durations with a reason during a shared session", () => {
    renderOpen({ durationsLockedBy: "Alex" });

    expect(screen.getByLabelText("Work")).toBeDisabled();
    expect(
      screen.getByText(/Only the host \(Alex\) can change timer settings/)
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Sound cues")).toBeEnabled();
  });

  it("lets a duration be cleared and retyped without snapping to 0", () => {
    const onDraftChange = vi.fn();
    renderOpen({ onDraftChange });
    const work = screen.getByLabelText("Work") as HTMLInputElement;

    fireEvent.change(work, { target: { value: "" } });
    expect(work.value).toBe("");
    expect(onDraftChange).toHaveBeenLastCalledWith("workMinutes", 0);

    fireEvent.change(work, { target: { value: "30" } });
    expect(onDraftChange).toHaveBeenLastCalledWith("workMinutes", 30);

    fireEvent.blur(work);
    expect(work.value).toBe("25");
  });

  it("warns that notifications are blocked even while the preference is still on", () => {
    vi.stubGlobal("Notification", { permission: "denied" });
    renderOpen(undefined, { ...prefs, notificationsEnabled: true });

    expect(screen.getByText("Blocked in your browser settings")).toBeInTheDocument();
    expect(screen.getByLabelText("Browser notifications")).toBeEnabled();
  });

  it("follows permission changes made while the tab stays focused", async () => {
    const listeners: Array<() => void> = [];
    const status = {
      addEventListener: vi.fn((_type: string, listener: () => void) => listeners.push(listener)),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("navigator", { permissions: { query: vi.fn().mockResolvedValue(status) } });
    const notification = { permission: "default" };
    vi.stubGlobal("Notification", notification);

    renderOpen();
    expect(screen.queryByText("Blocked in your browser settings")).not.toBeInTheDocument();
    await waitFor(() => expect(listeners).toHaveLength(1));

    notification.permission = "denied";
    act(() => listeners[0]());
    expect(screen.getByText("Blocked in your browser settings")).toBeInTheDocument();
  });

  it("saves from the keyboard with Enter and not when nothing changed", () => {
    const onSave = vi.fn();
    const { unmount } = render(
      <TimerSettingsCard
        saved={saved}
        draft={{ ...saved, workMinutes: 30 }}
        isSaving={false}
        prefs={prefs}
        onDraftChange={vi.fn()}
        onSave={onSave}
        onPrefsChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Timer settings/ }));
    fireEvent.submit(screen.getByLabelText("Work").closest("form")!);
    expect(onSave).toHaveBeenCalledTimes(1);
    unmount();

    renderOpen({ onSave });
    fireEvent.submit(screen.getByLabelText("Work").closest("form")!);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("hides the Save button when the durations are locked", () => {
    renderOpen({ durationsLockedBy: "Alex" });

    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Durations" })).toHaveAccessibleDescription(
      /Only the host \(Alex\)/
    );
  });

  it("rejects fractional minutes instead of silently truncating them", () => {
    const onDraftChange = vi.fn();
    renderOpen({ onDraftChange });

    fireEvent.change(screen.getByLabelText("Work"), { target: { value: "25.5" } });
    expect(onDraftChange).toHaveBeenLastCalledWith("workMinutes", 25.5);
  });

  it("does not shout an error while a field is being cleared to retype", () => {
    renderOpen({ draft: { ...saved, workMinutes: 0 } });
    fireEvent.change(screen.getByLabelText("Work"), { target: { value: "" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Enter a number to save");
  });

  it("announces unsaved changes in a status region", () => {
    renderOpen({ draft: { ...saved, workMinutes: 30 } });

    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");
  });
});

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

  it("keeps Save disabled and announces a specific message for an invalid field", () => {
    renderCard({ draft: { ...saved, longBreakMinutes: 2 } });
    const longBreak = screen.getByLabelText("Long break");

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(longBreak).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Use 5–60");
    expect(screen.getByText("Fix the highlighted fields to save")).toBeInTheDocument();
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
