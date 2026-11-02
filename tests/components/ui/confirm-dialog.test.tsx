import { useRef, useState } from "react";
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

  it("falls back to returnFocusTo when the element that asked has gone", async () => {
    function Menu() {
      const [confirm, dialog] = useConfirm();
      const [open, setOpen] = useState(true);
      const home = useRef<HTMLButtonElement>(null);

      return (
        <>
          <button type="button" ref={home}>
            Home
          </button>
          {open ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void confirm("Sure?", { returnFocusTo: () => home.current });
              }}
            >
              Item
            </button>
          ) : null}
          {dialog}
        </>
      );
    }
    render(<Menu />);

    const item = screen.getByRole("button", { name: "Item" });
    item.focus();
    fireEvent.click(item);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Home" })).toHaveFocus());
  });
});
