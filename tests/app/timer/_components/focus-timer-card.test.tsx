import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FocusTimerCard } from "@/app/timer/_components/focus-timer-card";

type Props = React.ComponentProps<typeof FocusTimerCard>;

function renderCard(overrides?: Partial<Props>) {
  const handlers = {
    onStart: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onSkip: vi.fn(),
    onReset: vi.fn(),
  };

  render(
    <FocusTimerCard
      phase="work"
      secondsLeft={1500}
      progressValue={0}
      isRunning={false}
      canResume={false}
      sessionNumber={1}
      durations={{ workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15 }}
      isSaving={false}
      controlledBy={null}
      style={{}}
      {...handlers}
      {...overrides}
    />
  );

  return handlers;
}

describe("FocusTimerCard", () => {
  it("exposes the clock as a named timer and names the progress bar", () => {
    renderCard();

    const timer = screen.getByRole("timer", { name: "Focus" });
    expect(timer).toHaveTextContent("25:00");
    expect(screen.getByRole("progressbar", { name: "Phase progress" })).toBeInTheDocument();
  });

  it("shows the session position as visible text, not only a tooltip", () => {
    renderCard({ sessionNumber: 2 });

    expect(screen.getByText("Session 2 of 4")).toBeInTheDocument();
  });

  it("previews the next phase: a short break after early focus sessions", () => {
    renderCard({ sessionNumber: 2 });

    expect(screen.getByText("Up next: Short break · 5 min")).toBeInTheDocument();
  });

  it("previews a long break before the last session of the cycle", () => {
    renderCard({ sessionNumber: 4 });

    expect(screen.getByText("Up next: Long break · 15 min")).toBeInTheDocument();
  });

  it("previews focus during a break and words the session as upcoming", () => {
    renderCard({ phase: "shortBreak", secondsLeft: 300, sessionNumber: 3 });

    expect(screen.getByText("Up next: Focus · 25 min")).toBeInTheDocument();
    expect(screen.getByText("Session 3 of 4 next")).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Short break" })).toHaveTextContent("05:00");
  });

  it("offers Start when idle and reports each control", () => {
    const { onStart, onSkip, onReset } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("offers Resume for a paused timer and Pause while running", () => {
    const { onResume } = renderCard({ canResume: true });
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("offers Pause while running", () => {
    const { onPause } = renderCard({ isRunning: true });

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    expect(onPause).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
  });

  it("explains who controls the timer instead of silently hiding the controls", () => {
    renderCard({ controlledBy: "Alex" });

    expect(screen.getByText("Controlled by Alex")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
  });

  it("shows the saving badge only while a session is being saved", () => {
    renderCard({ isSaving: true });

    expect(screen.getByText("Saving session…")).toBeInTheDocument();
  });
});

describe("FocusTimerCard Space shortcut", () => {
  function pressSpace(target: Element = document.body, init: KeyboardEventInit = {}) {
    return fireEvent.keyDown(target, { code: "Space", key: " ", ...init });
  }

  it("starts, pauses or resumes depending on the timer state", () => {
    const idle = renderCard();
    pressSpace();
    expect(idle.onStart).toHaveBeenCalledTimes(1);
  });

  it("pauses a running timer", () => {
    const { onPause } = renderCard({ isRunning: true });
    pressSpace();
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it("resumes a paused timer", () => {
    const { onResume } = renderCard({ canResume: true });
    pressSpace();
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("prevents the page from scrolling when it acts", () => {
    renderCard();
    expect(pressSpace()).toBe(false);
  });

  it("does nothing while typing or when a control has focus", () => {
    const { onStart } = renderCard();
    const field = document.createElement("input");
    document.body.appendChild(field);

    pressSpace(field);
    pressSpace(screen.getByRole("button", { name: "Skip" }));

    expect(onStart).not.toHaveBeenCalled();
    field.remove();
  });

  it("ignores modifier keys, key repeat and other keys", () => {
    const { onStart } = renderCard();

    pressSpace(document.body, { ctrlKey: true });
    pressSpace(document.body, { shiftKey: true });
    pressSpace(document.body, { repeat: true });
    fireEvent.keyDown(document.body, { code: "KeyS", key: "s" });

    expect(onStart).not.toHaveBeenCalled();
  });

  it("is disabled for non-owners of a shared session", () => {
    const { onStart } = renderCard({ controlledBy: "Alex" });
    pressSpace();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("advertises the shortcut on the primary button", () => {
    renderCard();
    expect(screen.getByRole("button", { name: "Start" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Space"
    );
  });
});
