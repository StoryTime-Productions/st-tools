import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HangoutCover } from "@/app/hub/hangouts/[hangoutId]/_components/hangout-cover";

vi.mock("@/app/hub/projects/[projectId]/_components/project-cover-editor", () => ({
  ProjectCoverEditor: ({ id, kind }: { id: string; kind: string }) => (
    <div data-testid="cover-editor">
      {kind} {id}
    </div>
  ),
}));

const props = { id: "h1", title: "Beach day", coverImageUrl: null };

describe("HangoutCover", () => {
  it("is a plain thumbnail without edit rights", () => {
    render(<HangoutCover {...props} canEdit={false} />);
    expect(screen.getByText("BD")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit cover" })).not.toBeInTheDocument();
  });

  it("opens the cover picker from the thumbnail for admins", () => {
    render(<HangoutCover {...props} canEdit />);
    expect(screen.queryByTestId("cover-editor")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit cover" }));
    expect(screen.getByTestId("cover-editor")).toHaveTextContent("hangout h1");
  });
});
