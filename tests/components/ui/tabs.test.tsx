import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants } from "@/components/ui/tabs";

describe("Tabs", () => {
  it("renders horizontal tabs structure by default", () => {
    const { container } = render(
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview content</TabsContent>
      </Tabs>
    );

    const tabsRoot = container.querySelector("[data-slot='tabs']") as HTMLElement;
    const tabsList = container.querySelector("[data-slot='tabs-list']") as HTMLElement;

    expect(tabsRoot.dataset.orientation).toBe("horizontal");
    expect(tabsList.dataset.variant).toBe("default");
    expect(screen.getByText("Overview content")).toBeInTheDocument();
  });

  it("supports vertical orientation and line variant", () => {
    const { container } = render(
      <Tabs defaultValue="overview" orientation="vertical">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Panel</TabsContent>
      </Tabs>
    );

    const tabsRoot = container.querySelector("[data-slot='tabs']") as HTMLElement;
    const tabsList = container.querySelector("[data-slot='tabs-list']") as HTMLElement;

    expect(tabsRoot.dataset.orientation).toBe("vertical");
    expect(tabsList.dataset.variant).toBe("line");
  });

  it("exposes variant class helper", () => {
    expect(tabsListVariants({ variant: "default" })).toContain("bg-muted");
    expect(tabsListVariants({ variant: "line" })).toContain("bg-transparent");
  });
});
