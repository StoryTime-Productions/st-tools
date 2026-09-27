import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ProjectAdminControls } from "@/app/hub/projects/[projectId]/_components/project-admin-controls";
import type { ProjectDetail } from "@/lib/hub";

const actionMocks = vi.hoisted(() => ({
  createInitiativeAction: vi.fn(),
  updateProjectAction: vi.fn(),
  setProjectFinishedAction: vi.fn(),
  deleteProjectAction: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const routerMocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("@/app/actions/hub", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));
vi.mock("@/components/ui/select", async () => import("../../../../../helpers/native-select"));

const PROJECT: ProjectDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "St-tools",
  description: "Tools",
  coverImageUrl: null,
  initiativeId: "22222222-2222-4222-8222-222222222222",
  initiativeName: "Internal Tools",
  startQuarter: "2026-Q3",
  endQuarter: "2026-Q4",
  phases: ["Concept", "Build", "Launch"],
  currentPhaseIndex: 1,
  links: [{ label: "GitHub", url: "https://github.com/x" }],
  tags: ["web"],
  finished: false,
};

function renderControls(project: ProjectDetail = PROJECT) {
  render(
    <ProjectAdminControls
      project={project}
      initiatives={[{ id: PROJECT.initiativeId!, name: "Internal Tools" }]}
      tagOptions={["design", "web"]}
    />
  );
}

function openEditor() {
  fireEvent.click(screen.getByRole("button", { name: /edit project/i }));
  return screen.getByRole("dialog");
}

describe("ProjectAdminControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    actionMocks.updateProjectAction.mockResolvedValue({ success: true });
    actionMocks.setProjectFinishedAction.mockResolvedValue({ success: true });
    actionMocks.deleteProjectAction.mockResolvedValue({ success: true });
  });

  it("marks projects finished and reopens them", async () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Mark finished" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Project marked finished"));
    expect(actionMocks.setProjectFinishedAction).toHaveBeenCalledWith(PROJECT.id, true);
  });

  it("reopens finished projects and reports errors", async () => {
    actionMocks.setProjectFinishedAction.mockResolvedValueOnce({ error: "Project not found" });
    renderControls({ ...PROJECT, finished: true });

    fireEvent.click(screen.getByRole("button", { name: "Reopen project" }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Project not found"));

    fireEvent.click(screen.getByRole("button", { name: "Reopen project" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Project reopened"));
    expect(actionMocks.setProjectFinishedAction).toHaveBeenLastCalledWith(PROJECT.id, false);
  });

  it("deletes projects after confirmation", async () => {
    actionMocks.deleteProjectAction.mockResolvedValueOnce({ error: "Project not found" });
    renderControls();

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(actionMocks.deleteProjectAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Project not found"));

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(routerMocks.push).toHaveBeenCalledWith("/hub"));
  });

  it("edits phases, tags and links and saves the whole project", async () => {
    renderControls();
    const sheet = openEditor();

    fireEvent.change(within(sheet).getByLabelText("Title"), { target: { value: "St Tools" } });
    fireEvent.change(within(sheet).getByLabelText("Description"), { target: { value: " " } });

    fireEvent.click(within(sheet).getByRole("button", { name: "Move phase 2 up" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Move phase 3 up" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove phase 1" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Add phase" }));
    fireEvent.change(within(sheet).getByLabelText("Phase 3 name"), {
      target: { value: " Ship " },
    });
    fireEvent.click(within(sheet).getByLabelText("Mark phase 3 as current"));

    fireEvent.click(within(sheet).getByRole("button", { name: "web" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "design" }));
    const newTag = within(sheet).getByLabelText("New tag name");
    fireEvent.change(newTag, { target: { value: " launch " } });
    fireEvent.keyDown(newTag, { key: "Enter" });
    fireEvent.change(newTag, { target: { value: "design" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Add" }));

    fireEvent.click(within(sheet).getByRole("button", { name: "Add link" }));
    fireEvent.change(within(sheet).getByLabelText("Link 2 label"), {
      target: { value: " Figma " },
    });
    fireEvent.change(within(sheet).getByLabelText("Link 2 URL"), {
      target: { value: " https://figma.com/f " },
    });
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove link 1" }));

    fireEvent.click(within(sheet).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Project updated"));
    expect(actionMocks.updateProjectAction).toHaveBeenCalledWith({
      projectId: PROJECT.id,
      title: "St Tools",
      description: null,
      initiativeId: PROJECT.initiativeId,
      startQuarter: "2026-Q3",
      endQuarter: "2026-Q4",
      tags: ["design", "launch"],
      phases: ["Launch", "Concept", "Ship"],
      currentPhaseIndex: 2,
      links: [{ label: "Figma", url: "https://figma.com/f" }],
    });
    expect(routerMocks.refresh).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  }, 15000);

  it("clears the current phase, tracks it through removals and reports save errors", async () => {
    actionMocks.updateProjectAction.mockResolvedValueOnce({ error: "Links must be full URLs" });
    renderControls();
    const sheet = openEditor();

    fireEvent.click(within(sheet).getByRole("button", { name: "Remove phase 1" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Move phase 1 down" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Clear current phase" }));
    expect(within(sheet).queryByRole("button", { name: "Clear current phase" })).toBeNull();

    fireEvent.click(within(sheet).getByLabelText("Mark phase 1 as current"));
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove phase 1" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Links must be full URLs"));
    expect(actionMocks.updateProjectAction).toHaveBeenCalledWith(
      expect.objectContaining({ phases: ["Build"], currentPhaseIndex: null })
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
