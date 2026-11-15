import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { CountdownsError } from "@/app/dashboard/_components/countdowns-error";

describe("CountdownsError", () => {
  it("says countdowns could not load and offers a retry", () => {
    render(<CountdownsError />);
    expect(screen.getByRole("alert")).toHaveTextContent("Countdowns could not load.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
