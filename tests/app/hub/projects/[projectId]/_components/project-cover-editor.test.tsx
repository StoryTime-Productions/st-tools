import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProjectCoverEditor } from "@/app/hub/projects/[projectId]/_components/project-cover-editor";

const actionMocks = vi.hoisted(() => ({
  setProjectCoverUrlAction: vi.fn(),
  uploadProjectCoverAction: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/app/actions/hub", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function renderEditor(coverImageUrl: string | null = null) {
  const { container } = render(
    <ProjectCoverEditor projectId={PROJECT_ID} title="St-tools" coverImageUrl={coverImageUrl} />
  );
  return container;
}

describe("ProjectCoverEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => "blob:preview");
  });

  it("uploads a chosen file and shows it", async () => {
    actionMocks.uploadProjectCoverAction.mockResolvedValue({ success: true });
    const container = renderEditor();
    expect(screen.getByText("S")).toBeInTheDocument();

    const input = screen.getByLabelText("Upload cover image") as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Upload image" }));
    expect(click).toHaveBeenCalled();

    fireEvent.change(input, { target: { files: [] } });
    expect(actionMocks.uploadProjectCoverAction).not.toHaveBeenCalled();

    const file = new File(["x"], "cover.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Cover updated"));
    const formData = actionMocks.uploadProjectCoverAction.mock.calls[0][0] as FormData;
    expect(formData.get("projectId")).toBe(PROJECT_ID);
    expect(formData.get("cover")).toBe(file);
    expect(container.querySelector("img")).toHaveAttribute("src", "blob:preview");
    expect(routerMocks.refresh).toHaveBeenCalled();
  });

  it("uses a pasted URL and reports errors", async () => {
    actionMocks.setProjectCoverUrlAction
      .mockResolvedValueOnce({ error: "Image URLs must start with http(s)://" })
      .mockResolvedValueOnce({ success: true });
    const container = renderEditor();
    const urlInput = screen.getByLabelText("Cover image URL");

    fireEvent.keyDown(urlInput, { key: "Enter" });
    expect(actionMocks.setProjectCoverUrlAction).not.toHaveBeenCalled();

    fireEvent.change(urlInput, { target: { value: "ftp://x" } });
    fireEvent.keyDown(urlInput, { key: "Enter" });
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("Image URLs must start with http(s)://")
    );
    expect(urlInput).toHaveValue("ftp://x");

    fireEvent.change(urlInput, { target: { value: "https://example.com/c.png" } });
    fireEvent.click(screen.getByRole("button", { name: "Use URL" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Cover updated"));
    expect(actionMocks.setProjectCoverUrlAction).toHaveBeenLastCalledWith(
      PROJECT_ID,
      "https://example.com/c.png"
    );
    expect(urlInput).toHaveValue("");
    expect(container.querySelector("img")).toHaveAttribute("src", "https://example.com/c.png");
  });

  it("removes an existing cover", async () => {
    actionMocks.setProjectCoverUrlAction.mockResolvedValue({ success: true });
    const container = renderEditor("https://example.com/c.png");

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Cover removed"));
    expect(actionMocks.setProjectCoverUrlAction).toHaveBeenCalledWith(PROJECT_ID, null);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });
});
