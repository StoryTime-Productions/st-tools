import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { BirthdaysCard, birthdayLabel } from "@/app/dashboard/_components/birthdays-card";

const row = (discordId: string, name: string, month: number, day: number, daysUntil: number) => ({
  discordId,
  name,
  avatarUrl: null,
  month,
  day,
  daysUntil,
});

describe("birthdayLabel", () => {
  it("says Today, Tomorrow, then the number of days", () => {
    expect(birthdayLabel(0)).toBe("Today");
    expect(birthdayLabel(1)).toBe("Tomorrow");
    expect(birthdayLabel(12)).toBe("in 12 days");
  });
});

describe("BirthdaysCard", () => {
  it("lists each person with initials, date and a countdown", () => {
    render(
      <BirthdaysCard
        birthdays={[
          row("1", "Kiara Prado", 11, 1, 0),
          row("2", "Denmar Ermitano", 2, 29, 1),
          row("3", "Abisan P", 12, 25, 54),
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "Birthdays" })).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByText("Kiara Prado")).toBeInTheDocument();
    expect(within(items[0]!).getByText("Nov 1")).toBeInTheDocument();
    expect(within(items[0]!).getByText("Today")).toBeInTheDocument();
    expect(within(items[0]!).getByText("KP")).toBeInTheDocument();
    expect(within(items[1]!).getByText("Feb 29")).toBeInTheDocument();
    expect(within(items[1]!).getByText("Tomorrow")).toBeInTheDocument();
    expect(within(items[2]!).getByText("in 54 days")).toBeInTheDocument();
  });

  it("explains how to add birthdays when there are none", () => {
    render(<BirthdaysCard birthdays={[]} />);

    expect(screen.getByText(/No birthdays saved yet/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
