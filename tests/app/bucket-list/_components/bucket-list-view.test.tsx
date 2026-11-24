import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { BucketListView } from "@/app/bucket-list/_components/bucket-list-view";
import type { BucketItemView } from "@/lib/bucket-list-core";

vi.mock("@/app/bucket-list/_components/bucket-item-card", () => ({
  BucketItemCard: ({ item }: { item: BucketItemView }) => <div>card:{item.title}</div>,
}));
vi.mock("@/app/bucket-list/_components/bucket-item-dialog", () => ({
  BucketItemDialog: ({ isAdmin }: { isAdmin: boolean }) => (
    <button type="button">Add an item {isAdmin ? "(admin)" : "(member)"}</button>
  ),
}));

const item = (id: string, status: BucketItemView["status"]): BucketItemView => ({
  id,
  title: id,
  notes: null,
  status,
  season: null,
  seasonYear: null,
  suggestedById: "u1",
  suggestedByName: "Alice",
  hangoutId: null,
  hangoutTitle: null,
  driveFolderId: null,
  doneAt: null,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  tags: [],
});

const viewer = { id: "u1", role: "MEMBER" as const };

describe("BucketListView", () => {
  it("shows the three status columns with counts and their cards", () => {
    render(
      <BucketListView
        grouped={{
          TODO: [item("Camping", "TODO"), item("Karaoke", "TODO")],
          IN_PLAN: [item("Cabin", "IN_PLAN")],
          DONE: [item("Skating", "DONE")],
        }}
        tagNames={[]}
        viewer={viewer}
      />
    );

    expect(screen.getByRole("heading", { level: 1, name: "The bucket list" })).toBeVisible();
    const todo = screen.getByRole("region", { name: /To do/ });
    expect(within(todo).getByText("2")).toBeVisible();
    expect(within(todo).getByText("card:Camping")).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: /In plan/ })).getByText("card:Cabin")
    ).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: /Done/ })).getByText("card:Skating")
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Add an item (member)" })).toBeVisible();
  });

  it("gives an empty column its own hint while other columns have items", () => {
    render(
      <BucketListView
        grouped={{ TODO: [item("Camping", "TODO")], IN_PLAN: [], DONE: [] }}
        tagNames={[]}
        viewer={{ id: "a", role: "ADMIN" }}
      />
    );

    expect(screen.getByText("Nothing in plan")).toBeVisible();
    expect(screen.getByText("Nothing done yet")).toBeVisible();
    expect(screen.queryByText("Nothing to do yet")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add an item (admin)" })).toBeVisible();
  });

  it("shows one page-level empty state when the list has no items", () => {
    render(
      <BucketListView grouped={{ TODO: [], IN_PLAN: [], DONE: [] }} tagNames={[]} viewer={viewer} />
    );

    expect(screen.getByRole("heading", { name: "The list is empty" })).toBeVisible();
    expect(screen.queryByText("Nothing in plan")).not.toBeInTheDocument();
  });
});
