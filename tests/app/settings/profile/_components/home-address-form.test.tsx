import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HomeAddressForm } from "@/app/settings/profile/_components/home-address-form";

const actionMocks = vi.hoisted(() => ({ updateHomeAddressAction: vi.fn() }));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/app/actions/profile", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));

function submit(value: string) {
  fireEvent.change(screen.getByLabelText("Home address"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Save address" }));
}

describe("HomeAddressForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves the address and shows the geocoded match", async () => {
    actionMocks.updateHomeAddressAction.mockResolvedValue({
      success: true,
      address: "290 Bremner Blvd, Toronto",
      located: true,
    });
    render(<HomeAddressForm initialAddress={null} initialLocated={false} />);
    expect(screen.queryByText(/Saved as/)).not.toBeInTheDocument();

    submit("290 bremner");
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Home address saved"));
    expect(actionMocks.updateHomeAddressAction).toHaveBeenCalledWith("290 bremner");
    expect(screen.getByText("Saved as: 290 Bremner Blvd, Toronto")).toBeInTheDocument();
    expect(screen.getByLabelText("Home address")).toHaveValue("290 Bremner Blvd, Toronto");
  });

  it("notes unlocated addresses, reports errors, and clears", async () => {
    render(<HomeAddressForm initialAddress="12 Elm St" initialLocated={false} />);
    expect(screen.getByText(/couldn't locate it on the map/)).toBeInTheDocument();

    actionMocks.updateHomeAddressAction.mockResolvedValueOnce({
      error: "Couldn't find that address. Check it and try again.",
    });
    submit("zzqq");
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        "Couldn't find that address. Check it and try again."
      )
    );
    expect(screen.getByLabelText("Home address")).toHaveValue("zzqq");

    actionMocks.updateHomeAddressAction.mockResolvedValueOnce({
      success: true,
      address: null,
      located: false,
    });
    submit("");
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Home address cleared"));
    expect(screen.queryByText(/Saved as/)).not.toBeInTheDocument();
  });
});
