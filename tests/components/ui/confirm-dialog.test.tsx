import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useConfirm } from "@/components/ui/confirm-dialog";

function Harness({ onResult }: { onResult: (confirmed: boolean) => void }) {
  const [confirm, dialog] = useConfirm();

  return (
    <>
      <button
        type="button"
        onClick={async () =>
          onResult(
            await confirm("It will be gone.", { title: "Delete it?", confirmLabel: "Delete" })
          )
        }
      >
        Ask
      </button>
      {dialog}
    </>
  );
}

describe("useConfirm", () => {
  it("resolves true when confirmed", async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);

    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByRole("dialog", { name: "Delete it?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it("resolves false on cancel and gives focus back to the button that asked", async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    const ask = screen.getByRole("button", { name: "Ask" });

    ask.focus();
    fireEvent.click(ask);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    await waitFor(() => expect(ask).toHaveFocus());
  });
});
