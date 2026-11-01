import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HubAdminActions } from "@/app/hub/_components/hub-admin-actions";

vi.mock("@/app/hub/_components/hangout-dialog", () => ({
  HangoutDialog: () => <button type="button">New hangout</button>,
}));
vi.mock("@/app/hub/_components/new-project-dialog", () => ({
  NewProjectDialog: () => <button type="button">New project</button>,
}));
vi.mock("@/app/hub/_components/manage-initiatives-dialog", () => ({
  ManageInitiativesDialog: ({
    open,
    onOpenChange,
    onCloseAutoFocus,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCloseAutoFocus?: (event: Event) => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="Initiatives">
        <button
          type="button"
          onClick={() => {
            onOpenChange(false);
            onCloseAutoFocus?.(new Event("close"));
          }}
        >
          Close initiatives
        </button>
      </div>
    ) : null,
}));

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

describe("HubAdminActions", () => {
  it("shows both creates, the desktop manage button and the phone menu trigger", () => {
    render(<HubAdminActions initiatives={[]} />);

    expect(screen.getByRole("button", { name: "New hangout" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New project" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage initiatives" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More admin actions" })).toBeInTheDocument();
  });

  it("opens the initiatives dialog from the desktop button and returns focus to it", async () => {
    render(<HubAdminActions initiatives={[]} />);
    const manage = screen.getByRole("button", { name: "Manage initiatives" });

    manage.focus();
    fireEvent.click(manage);
    fireEvent.click(await screen.findByRole("button", { name: "Close initiatives" }));

    await waitFor(() => expect(manage).toHaveFocus());
  });

  it("opens the initiatives dialog from the phone menu and returns focus to its trigger", async () => {
    render(<HubAdminActions initiatives={[]} />);
    const more = screen.getByRole("button", { name: "More admin actions" });

    fireEvent.keyDown(more, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Manage initiatives" }));
    expect(await screen.findByRole("dialog", { name: "Initiatives" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close initiatives" }));
    await waitFor(() => expect(more).toHaveFocus());
  });
});
