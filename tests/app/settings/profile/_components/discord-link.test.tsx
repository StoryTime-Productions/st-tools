import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DiscordLink } from "@/app/settings/profile/_components/discord-link";

const actionMocks = vi.hoisted(() => ({
  connectDiscordAction: vi.fn(),
  disconnectDiscordAction: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/app/actions/profile", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));

describe("DiscordLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("connects Discord and reports errors", async () => {
    actionMocks.connectDiscordAction
      .mockResolvedValueOnce({ error: "Manual linking is disabled" })
      .mockResolvedValueOnce({ success: true });
    render(<DiscordLink connected={false} />);

    expect(screen.getByText(/Connect your Discord account/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Connect Discord" }));
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("Manual linking is disabled")
    );

    fireEvent.click(screen.getByRole("button", { name: "Connect Discord" }));
    await waitFor(() => expect(actionMocks.connectDiscordAction).toHaveBeenCalledTimes(2));
    expect(toastMocks.success).not.toHaveBeenCalled();
  });

  it("disconnects a linked account", async () => {
    actionMocks.disconnectDiscordAction.mockResolvedValue({ success: true });
    render(<DiscordLink connected />);

    expect(screen.getByText(/Connected\. st-bot can message you/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Discord disconnected"));
  });
});
