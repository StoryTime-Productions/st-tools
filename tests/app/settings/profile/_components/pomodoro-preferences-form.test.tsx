import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PomodoroPreferencesForm } from "@/app/settings/profile/_components/pomodoro-preferences-form";

const actionMocks = vi.hoisted(() => ({
  updatePomodoroPreferencesAction: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/app/actions/pomodoro", () => actionMocks);
vi.mock("sonner", () => ({
  toast: toastMocks,
}));

describe("PomodoroPreferencesForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.updatePomodoroPreferencesAction.mockResolvedValue({ success: true });
  });

  it("parses empty numeric input values to zero", () => {
    render(
      <PomodoroPreferencesForm
        initialWorkMin={25}
        initialShortBreakMin={5}
        initialLongBreakMin={15}
      />
    );

    const workInput = screen.getByLabelText("Work (minutes)") as HTMLInputElement;
    const shortBreakInput = screen.getByLabelText("Short break (minutes)") as HTMLInputElement;
    const longBreakInput = screen.getByLabelText("Long break (minutes)") as HTMLInputElement;

    fireEvent.change(workInput, { target: { value: "" } });
    fireEvent.change(shortBreakInput, { target: { value: "" } });
    fireEvent.change(longBreakInput, { target: { value: "" } });

    expect(workInput.value).toBe("0");
    expect(shortBreakInput.value).toBe("0");
    expect(longBreakInput.value).toBe("0");
    expect(actionMocks.updatePomodoroPreferencesAction).not.toHaveBeenCalled();
  });

  it("submits preferences and shows success toast", async () => {
    render(
      <PomodoroPreferencesForm
        initialWorkMin={25}
        initialShortBreakMin={5}
        initialLongBreakMin={15}
      />
    );

    fireEvent.change(screen.getByLabelText("Work (minutes)"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Short break (minutes)"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Long break (minutes)"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Save timer settings" }));

    await waitFor(() => {
      expect(actionMocks.updatePomodoroPreferencesAction).toHaveBeenCalledWith({
        workMin: 30,
        shortBreakMin: 7,
        longBreakMin: 20,
      });
    });

    expect(toastMocks.success).toHaveBeenCalledWith("Pomodoro preferences updated");
  });

  it("shows an error toast when submit fails", async () => {
    actionMocks.updatePomodoroPreferencesAction.mockResolvedValueOnce({
      error: "Unable to update preferences",
    });

    render(
      <PomodoroPreferencesForm
        initialWorkMin={25}
        initialShortBreakMin={5}
        initialLongBreakMin={15}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Save timer settings" }));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("Unable to update preferences");
    });
  });
});
