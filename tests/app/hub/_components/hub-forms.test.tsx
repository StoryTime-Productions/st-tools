import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InitiativeSelect } from "@/app/hub/_components/initiative-select";
import { ManageInitiativesDialog } from "@/app/hub/_components/manage-initiatives-dialog";
import { NewProjectDialog } from "@/app/hub/_components/new-project-dialog";
import { QuarterRangeFields } from "@/app/hub/_components/quarter-range-fields";

const actionMocks = vi.hoisted(() => ({
  createInitiativeAction: vi.fn(),
  renameInitiativeAction: vi.fn(),
  deleteInitiativeAction: vi.fn(),
  createProjectAction: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const routerMocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("@/app/actions/hub", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));
vi.mock("@/components/ui/select", async () => import("../../../helpers/native-select"));

const INITIATIVES = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Game Dev" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Internal Tools" },
];

describe("InitiativeSelect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderSelect(onChange = vi.fn()) {
    render(
      <InitiativeSelect
        id="initiative"
        initiatives={INITIATIVES}
        value={null}
        onChange={onChange}
      />
    );
    return onChange;
  }

  it("selects existing initiatives and ignores empty values", () => {
    const onChange = renderSelect();
    const select = screen.getByRole("combobox");

    fireEvent.change(select, { target: { value: INITIATIVES[1].id } });
    fireEvent.change(select, { target: { value: "" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(INITIATIVES[1].id);
  });

  it("creates a new initiative inline and selects it", async () => {
    actionMocks.createInitiativeAction.mockResolvedValue({
      success: true,
      initiative: { id: "33333333-3333-4333-8333-333333333333", name: "YouTube" },
    });
    const onChange = renderSelect();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "__new__" } });
    const input = screen.getByLabelText("New initiative name");

    fireEvent.change(input, { target: { value: "game dev" } });
    expect(screen.getByText("That initiative already exists.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();

    fireEvent.change(input, { target: { value: " YouTube " } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("33333333-3333-4333-8333-333333333333")
    );
    expect(actionMocks.createInitiativeAction).toHaveBeenCalledWith("YouTube");
    expect(screen.queryByLabelText("New initiative name")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "YouTube" })).toBeInTheDocument();
  });

  it("keeps the draft open on errors and closes on Escape", async () => {
    actionMocks.createInitiativeAction.mockResolvedValue({ error: "Nope" });
    renderSelect();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "__new__" } });
    const input = screen.getByLabelText("New initiative name");
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(actionMocks.createInitiativeAction).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "Music" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Nope"));
    expect(screen.getByLabelText("New initiative name")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByLabelText("New initiative name"), { key: "Escape" });
    expect(screen.queryByLabelText("New initiative name")).not.toBeInTheDocument();
  });
});

describe("QuarterRangeFields", () => {
  it("keeps the end quarter on or after the start and clears with Not set", () => {
    const onChange = vi.fn();
    const { rerender } = render(<QuarterRangeFields start={null} end={null} onChange={onChange} />);
    const [startSelect, endSelect] = screen.getAllByRole("combobox");
    expect(endSelect).toBeDisabled();

    fireEvent.change(startSelect, { target: { value: "2026-Q3" } });
    expect(onChange).toHaveBeenLastCalledWith({ start: "2026-Q3", end: null });

    rerender(<QuarterRangeFields start="2026-Q3" end="2026-Q2" onChange={onChange} />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "2026-Q4" } });
    expect(onChange).toHaveBeenLastCalledWith({ start: "2026-Q4", end: "2026-Q4" });

    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "none" } });
    expect(onChange).toHaveBeenLastCalledWith({ start: "2026-Q3", end: null });

    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "none" } });
    expect(onChange).toHaveBeenLastCalledWith({ start: null, end: null });
  });
});

describe("NewProjectDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function openDialog() {
    render(<NewProjectDialog initiatives={INITIATIVES} />);
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "St-tools" } });
  }

  it("requires an initiative, then creates the project and opens it", async () => {
    actionMocks.createProjectAction.mockResolvedValue({
      success: true,
      projectId: "44444444-4444-4444-8444-444444444444",
    });
    openDialog();

    const submit = screen.getByRole("button", { name: "Create project" });
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest("form")!);
    expect(toastMocks.error).toHaveBeenCalledWith("Choose an initiative");

    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: INITIATIVES[0].id },
    });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "  Tools  " } });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() =>
      expect(routerMocks.push).toHaveBeenCalledWith(
        "/hub/projects/44444444-4444-4444-8444-444444444444"
      )
    );
    expect(actionMocks.createProjectAction).toHaveBeenCalledWith({
      title: "St-tools",
      description: "Tools",
      initiativeId: INITIATIVES[0].id,
      startQuarter: null,
      endQuarter: null,
    });
    expect(toastMocks.success).toHaveBeenCalledWith("Project created");
  });

  it("shows action errors and resets when closed", async () => {
    actionMocks.createProjectAction.mockResolvedValue({ error: "Initiative not found" });
    openDialog();

    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: INITIATIVES[0].id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Initiative not found"));
    expect(actionMocks.createProjectAction).toHaveBeenCalledWith(
      expect.objectContaining({ description: null })
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    expect(screen.getByLabelText("Title")).toHaveValue("");
  });
});

describe("ManageInitiativesDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("explains an empty list", () => {
    render(<ManageInitiativesDialog initiatives={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage initiatives" }));
    expect(screen.getByText("No initiatives yet.")).toBeInTheDocument();
  });

  it("renames initiatives", async () => {
    actionMocks.renameInitiativeAction
      .mockResolvedValueOnce({ error: "Taken" })
      .mockResolvedValueOnce({ success: true });
    render(<ManageInitiativesDialog initiatives={INITIATIVES} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage initiatives" }));

    fireEvent.click(screen.getByRole("button", { name: "Rename Game Dev" }));
    const input = screen.getByRole("textbox", { name: "Rename Game Dev" });
    fireEvent.change(input, { target: { value: "Games" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Taken"));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Initiative renamed"));
    expect(actionMocks.renameInitiativeAction).toHaveBeenLastCalledWith(INITIATIVES[0].id, "Games");
    expect(routerMocks.refresh).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Rename Internal Tools" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Rename Internal Tools" }), {
      key: "Escape",
    });
    fireEvent.click(screen.getByRole("button", { name: "Rename Internal Tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("deletes initiatives after confirmation", async () => {
    actionMocks.deleteInitiativeAction
      .mockResolvedValueOnce({ error: "Initiative not found" })
      .mockResolvedValueOnce({ success: true });
    render(<ManageInitiativesDialog initiatives={INITIATIVES} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage initiatives" }));

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete Game Dev" }));
    expect(actionMocks.deleteInitiativeAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete Game Dev" }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Initiative not found"));

    fireEvent.click(screen.getByRole("button", { name: "Delete Game Dev" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Initiative deleted"));
  });
});
