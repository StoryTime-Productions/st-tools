import { Children, isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RoleSelect } from "@/app/admin/members/_components/role-select";

const actionMocks = vi.hoisted(() => ({
  updateUserRoleAction: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/app/actions/admin", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
    disabled,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (value: string) => void;
    disabled?: boolean;
  }) => {
    // the real trigger carries the accessible name, so read it from there like a user's screen reader would
    const trigger = Children.toArray(children).find(
      (child) => isValidElement(child) && "aria-label" in (child.props as object)
    );
    const label = isValidElement(trigger)
      ? ((trigger.props as { "aria-label": string })["aria-label"] ?? "Role")
      : "Role";

    return (
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
        disabled={disabled}
      >
        {children}
      </select>
    );
  },
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

const SELF = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function renderSelect(props: { userId?: string; currentRole: "ADMIN" | "MEMBER" }) {
  return render(
    <RoleSelect
      userId={props.userId ?? OTHER}
      label="Bob Member"
      currentUserId={SELF}
      currentRole={props.currentRole}
    />
  );
}

describe("RoleSelect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.updateUserRoleAction.mockResolvedValue({ success: true });
  });

  it("names each select after its member and disables the current user's own", () => {
    render(
      <RoleSelect userId={SELF} label="Alice Admin" currentUserId={SELF} currentRole="ADMIN" />
    );

    expect(
      screen.getByRole("combobox", {
        name: "Role for Alice Admin (you can't change your own role)",
      })
    ).toBeDisabled();
  });

  it("asks before making a member an admin, and only saves once confirmed", async () => {
    renderSelect({ currentRole: "MEMBER" });

    fireEvent.change(screen.getByRole("combobox", { name: "Role for Bob Member" }), {
      target: { value: "ADMIN" },
    });

    expect(await screen.findByText("Make this member an admin?")).toBeVisible();
    expect(screen.getByText(/Make Bob Member an admin\?/)).toBeVisible();
    expect(actionMocks.updateUserRoleAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Make admin" }));

    await waitFor(() => {
      expect(actionMocks.updateUserRoleAction).toHaveBeenCalledWith(OTHER, "ADMIN");
    });
    expect(toastMocks.success).toHaveBeenCalledWith("Bob Member is now an admin");
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Role for Bob Member" })).toHaveValue("ADMIN")
    );
  });

  it("does nothing when the admin confirmation is cancelled", async () => {
    renderSelect({ currentRole: "MEMBER" });

    fireEvent.change(screen.getByRole("combobox", { name: "Role for Bob Member" }), {
      target: { value: "ADMIN" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByText("Make this member an admin?")).not.toBeInTheDocument();
    });
    expect(actionMocks.updateUserRoleAction).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Role for Bob Member" })).toHaveValue("MEMBER");
  });

  it("demotes without asking and ignores re-selecting the current role", async () => {
    renderSelect({ currentRole: "ADMIN" });
    const select = screen.getByRole("combobox", { name: "Role for Bob Member" });

    fireEvent.change(select, { target: { value: "ADMIN" } });
    expect(actionMocks.updateUserRoleAction).not.toHaveBeenCalled();

    fireEvent.change(select, { target: { value: "MEMBER" } });

    await waitFor(() => {
      expect(actionMocks.updateUserRoleAction).toHaveBeenCalledWith(OTHER, "MEMBER");
    });
    expect(toastMocks.success).toHaveBeenCalledWith("Bob Member is now a member");
    expect(screen.queryByText("Make this member an admin?")).not.toBeInTheDocument();
  });

  it("shows an error toast and keeps the old role when the update fails", async () => {
    actionMocks.updateUserRoleAction.mockResolvedValueOnce({ error: "Not allowed" });
    renderSelect({ currentRole: "ADMIN" });

    fireEvent.change(screen.getByRole("combobox", { name: "Role for Bob Member" }), {
      target: { value: "MEMBER" },
    });

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("Not allowed");
    });
    expect(screen.getByRole("combobox", { name: "Role for Bob Member" })).toHaveValue("ADMIN");
  });
});
