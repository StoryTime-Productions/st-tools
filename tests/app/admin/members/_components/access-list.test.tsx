import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const add = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/app/actions/allowed-emails", () => ({
  addAllowedEmailAction: add,
  removeAllowedEmailAction: remove,
}));

import { AccessList } from "@/app/admin/members/_components/access-list";

const entries = [
  { email: "joined@x.gg", joined: true },
  { email: "waiting@x.gg", joined: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  add.mockResolvedValue({ success: true });
  remove.mockResolvedValue({ success: true });
});

describe("AccessList", () => {
  it("shows Joined or Not joined yet as text, and a remove button only for the one not joined", () => {
    render(<AccessList entries={entries} />);
    expect(screen.getByText("Joined")).toBeInTheDocument();
    expect(screen.getByText("Not joined yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove waiting@x.gg" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove joined@x.gg" })).toBeNull();
  });

  it("says nobody new can sign up when the list is empty", () => {
    render(<AccessList entries={[]} />);
    expect(screen.getByText(/Nobody new can create an account/)).toBeInTheDocument();
  });

  it("keeps Add disabled until something is typed", async () => {
    render(<AccessList entries={[]} />);
    const button = screen.getByRole("button", { name: "Add email" });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Add an email"), "a@b.co");
    expect(button).toBeEnabled();
  });

  it("adds an email, confirms with a toast, clears the field and keeps focus there", async () => {
    render(<AccessList entries={[]} />);
    const field = screen.getByLabelText("Add an email");
    await userEvent.type(field, "New@B.co");
    await userEvent.click(screen.getByRole("button", { name: "Add email" }));
    await waitFor(() => expect(add).toHaveBeenCalledWith("New@B.co"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("new@b.co can now sign up"));
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
  });

  it("shows a refused add as an inline alert tied to the field", async () => {
    add.mockResolvedValue({ error: "That email is already on the list." });
    render(<AccessList entries={[]} />);
    const field = screen.getByLabelText("Add an email");
    await userEvent.type(field, "a@b.co");
    await userEvent.click(screen.getByRole("button", { name: "Add email" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That email is already on the list.");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", alert.id);
    expect(field).toHaveFocus();
  });

  it("removes after the admin confirms", async () => {
    // a real server round trip outlasts the dialog closing, which hands focus to the clicked row
    remove.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 50))
    );
    render(<AccessList entries={entries} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove waiting@x.gg" }));
    expect(screen.getByText(/waiting@x.gg will no longer be able/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("waiting@x.gg"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Removed from the list"));
    await waitFor(() => expect(screen.getByLabelText("Add an email")).toHaveFocus());
  });

  it("moves focus to the email field when the row that asked is already gone", async () => {
    const { rerender } = render(<AccessList entries={entries} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove waiting@x.gg" }));
    rerender(<AccessList entries={[entries[0]]} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.getByLabelText("Add an email")).toHaveFocus());
  });

  it("keeps the entry when the admin cancels", async () => {
    render(<AccessList entries={entries} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove waiting@x.gg" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(remove).not.toHaveBeenCalled();
  });

  it("reports a refused removal", async () => {
    remove.mockResolvedValue({ error: "That person already has an account." });
    render(<AccessList entries={entries} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove waiting@x.gg" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("That person already has an account.")
    );
  });
});
