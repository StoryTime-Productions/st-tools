import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const saveCountdownAction = vi.fn();
vi.mock("@/app/actions/countdowns", () => ({
  saveCountdownAction: (...args: unknown[]) => saveCountdownAction(...args),
}));

import { CountdownDialog, type CountdownItem } from "@/app/dashboard/_components/countdown-dialog";

const MEMBERS = [
  { id: "u1", name: "Alice" },
  { id: "u2", name: "Bob" },
];

const item = (over: Partial<CountdownItem> = {}): CountdownItem => ({
  id: "c1",
  title: "Trip",
  targetAt: "2026-12-01T20:00:00.000Z",
  scope: "PERSONAL",
  ownerId: "me",
  audienceCount: null,
  audienceUserIds: [],
  dismissed: false,
  ...over,
});

function setup(props: Partial<React.ComponentProps<typeof CountdownDialog>> = {}) {
  const onOpenChange = vi.fn();
  render(
    <CountdownDialog
      open
      onOpenChange={onOpenChange}
      item={null}
      isAdmin={false}
      members={MEMBERS}
      {...props}
    />
  );
  return { onOpenChange };
}

const fill = (title: string, when: string) => {
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: title } });
  if (when) fireEvent.change(screen.getByLabelText("Date and time"), { target: { value: when } });
};

describe("CountdownDialog", () => {
  beforeEach(() => {
    saveCountdownAction.mockReset().mockResolvedValue({ success: true });
  });

  it("asks a member for a title and date only and says the countdown is private", () => {
    setup();
    expect(screen.getByRole("heading", { name: "New countdown" })).toBeInTheDocument();
    expect(screen.getByText(/Only you see it/)).toBeInTheDocument();
    expect(screen.queryByText("Who sees it")).not.toBeInTheDocument();
  });

  it("asks for a date before saving", async () => {
    setup();
    fill("Trip", "");
    await userEvent.click(screen.getByRole("button", { name: "Create countdown" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pick a date and time.");
    const field = screen.getByLabelText("Date and time");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", "countdown-error");
    expect(field).toHaveFocus();
    expect(saveCountdownAction).not.toHaveBeenCalled();
  });

  it("saves a personal countdown at the Toronto wall time and closes", async () => {
    const { onOpenChange } = setup();
    fill("Trip", "2026-12-01T15:00");
    await userEvent.click(screen.getByRole("button", { name: "Create countdown" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(saveCountdownAction).toHaveBeenCalledWith({
      id: undefined,
      title: "Trip",
      targetAt: "2026-12-01T20:00:00.000Z",
      who: "ONLY_ME",
      userIds: [],
    });
  });

  it("shows the server's sentence and stays open on an error", async () => {
    saveCountdownAction.mockResolvedValue({ error: "Pick a date and time in the future." });
    const { onOpenChange } = setup();
    fill("Trip", "2020-01-01T10:00");
    await userEvent.click(screen.getByRole("button", { name: "Create countdown" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("in the future");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("does not close while a save is in flight", async () => {
    let finish: (v: unknown) => void = () => undefined;
    saveCountdownAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { onOpenChange } = setup();
    fill("Trip", "2026-12-01T15:00");
    await userEvent.click(screen.getByRole("button", { name: "Create countdown" }));
    expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
    finish({ success: true });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("passes the close-focus handler to the dialog", async () => {
    const onCloseAutoFocus = vi.fn((event: Event) => event.preventDefault());
    const { onOpenChange } = setup({ onCloseAutoFocus });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes on Escape when nothing is saving", async () => {
    const { onOpenChange } = setup();
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("cancels", async () => {
    const { onOpenChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("lets an admin pick who sees it and choose people one by one", async () => {
    setup({ isAdmin: true });
    expect(screen.getByRole("group", { name: "Who sees it" })).toBeInTheDocument();
    expect(screen.getByText(/Personal ones disappear a day after they end/)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "People who see this countdown" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Choose people" }));
    expect(screen.getByText("0 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Alice" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Bob" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Bob" }));
    fill("Meetup", "2026-12-01T15:00");
    await userEvent.click(screen.getByRole("button", { name: "Create countdown" }));

    await waitFor(() =>
      expect(saveCountdownAction).toHaveBeenCalledWith(
        expect.objectContaining({ who: "CHOSEN", userIds: ["u1"] })
      )
    );
  });

  it("sends no people when an admin switches back to everyone", async () => {
    setup({ isAdmin: true });
    await userEvent.click(screen.getByRole("button", { name: "Choose people" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Alice" }));
    await userEvent.click(screen.getByRole("button", { name: "Everyone" }));
    fill("Meetup", "2026-12-01T15:00");
    await userEvent.click(screen.getByRole("button", { name: "Create countdown" }));
    await waitFor(() =>
      expect(saveCountdownAction).toHaveBeenCalledWith(
        expect.objectContaining({ who: "EVERYONE", userIds: [] })
      )
    );
  });

  it("opens an existing countdown filled in, and saves it under its id", async () => {
    setup({ item: item() });
    expect(screen.getByRole("heading", { name: "Edit countdown" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Trip");
    expect(screen.getByLabelText("Date and time")).toHaveValue("2026-12-01T15:00");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(saveCountdownAction).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }))
    );
  });

  it("opens a global countdown with its audience selected for an admin", () => {
    setup({
      isAdmin: true,
      item: item({ scope: "GLOBAL", audienceCount: 1, audienceUserIds: ["u2"] }),
    });
    expect(screen.getByRole("checkbox", { name: "Bob" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Alice" })).not.toBeChecked();
  });

  it("opens an everyone countdown on Everyone", () => {
    setup({ isAdmin: true, item: item({ scope: "GLOBAL" }) });
    expect(screen.getByRole("button", { name: "Everyone" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });
});
