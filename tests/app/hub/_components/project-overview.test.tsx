import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ProjectSummary } from "@/lib/hub";

function summary(overrides: Partial<ProjectSummary>): ProjectSummary {
  return {
    id: "p",
    title: "Project",
    coverImageUrl: null,
    initiativeName: null,
    startQuarter: null,
    endQuarter: null,
    quarterLabel: null,
    currentPhase: null,
    finished: false,
    linkUrls: [],
    participants: [],
    ...overrides,
  };
}

const PEOPLE = Array.from({ length: 7 }, (_, index) => ({
  id: `u${index}`,
  name: `Person ${index}`,
  avatarUrl: null,
}));

const PROJECTS = [
  summary({
    id: "p1",
    title: "St-tools",
    initiativeName: "Internal Tools",
    startQuarter: "2026-Q3",
    endQuarter: "2026-Q4",
    quarterLabel: "Q3 2026 – Q4 2026",
    currentPhase: "Build",
    linkUrls: ["https://github.com/x", "https://figma.com/y"],
    participants: PEOPLE,
  }),
  summary({
    id: "p2",
    title: "Channel",
    initiativeName: "YouTube",
    startQuarter: "2026-Q3",
    endQuarter: "2026-Q3",
    quarterLabel: "Q3 2026",
  }),
  summary({ id: "p3", title: "Someday" }),
  summary({ id: "p4", title: "Shipped", finished: true }),
];

async function renderOverview(projects = PROJECTS) {
  const { ProjectOverview } = await import("@/app/hub/_components/project-overview");
  render(<ProjectOverview projects={projects} />);
}

function titles() {
  return screen.getAllByRole("link").map((link) => link.querySelector("p")?.textContent);
}

describe("ProjectOverview", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists active projects by soonest end quarter with card details", async () => {
    await renderOverview();

    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    expect(titles()).toEqual(["Channel", "St-tools", "Someday"]);

    const card = screen.getByRole("link", { name: /St-tools/ });
    expect(card).toHaveAttribute("href", "/hub/projects/p1");
    expect(within(card).getByText("Internal Tools · Q3 2026 – Q4 2026")).toBeInTheDocument();
    expect(within(card).getByText("Build")).toBeInTheDocument();
    expect(card.querySelectorAll("svg")).toHaveLength(2);
    expect(within(card).getByLabelText("7 participants")).toBeInTheDocument();
    expect(within(card).getByText("+2")).toBeInTheDocument();
    expect(within(card).getAllByText(/^P[0-9]$/)).toHaveLength(5);
    expect(screen.getByRole("link", { name: /Someday/ })).toHaveTextContent("No initiative");
  });

  it("groups by quarter and initiative and remembers the view", async () => {
    await renderOverview();

    fireEvent.click(screen.getByRole("button", { name: "By quarter" }));
    expect(localStorage.getItem("hub-overview-view")).toBe("quarter");
    const q4 = screen.getByRole("region", { name: "Q4 2026" });
    expect(within(q4).getAllByRole("link")).toHaveLength(1);
    expect(
      within(screen.getByRole("region", { name: "Q3 2026" })).getAllByRole("link")
    ).toHaveLength(2);
    expect(screen.getByRole("region", { name: "No quarter" })).toHaveTextContent("Someday");

    fireEvent.click(screen.getByRole("button", { name: "By initiative" }));
    expect(screen.getByRole("region", { name: "Internal Tools" })).toHaveTextContent("St-tools");
    expect(screen.getByRole("region", { name: "No initiative" })).toHaveTextContent("Someday");
  });

  it("restores a saved view", async () => {
    localStorage.setItem("hub-overview-view", "initiative");
    await renderOverview();
    expect(screen.getByRole("button", { name: "By initiative" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("ignores an unknown saved view", async () => {
    localStorage.setItem("hub-overview-view", "calendar");
    await renderOverview();
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps working when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await renderOverview();

    fireEvent.click(screen.getByRole("button", { name: "By quarter" }));
    expect(screen.getByRole("button", { name: "By quarter" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("shows finished projects under Past and explains empty states", async () => {
    await renderOverview();

    fireEvent.click(screen.getByRole("button", { name: "Past" }));
    expect(titles()).toEqual(["Shipped"]);
    expect(screen.getByText("Finished")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Past" }));
    expect(titles()).toHaveLength(3);
  });

  it("says when every project is finished", async () => {
    await renderOverview([summary({ id: "p9", title: "Done", finished: true })]);
    expect(screen.getByText(/No active projects/)).toBeInTheDocument();
  });

  it("says when there are no finished projects", async () => {
    await renderOverview([summary({ id: "p8", title: "Live" })]);
    fireEvent.click(screen.getByRole("button", { name: "Past" }));
    expect(screen.getByText("No finished projects yet.")).toBeInTheDocument();
  });
});
