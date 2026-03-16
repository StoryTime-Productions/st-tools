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
    defaultValue,
    onValueChange,
    disabled,
  }: {
    children: React.ReactNode;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    disabled?: boolean;
  }) => (
    <select
      aria-label="Role"
      defaultValue={defaultValue}
      onChange={(event) => onValueChange?.(event.target.value)}
      disabled={disabled}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

describe("RoleSelect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.updateUserRoleAction.mockResolvedValue({ success: true });
  });

  it("disables role changes for the current user", () => {
    render(
      <RoleSelect
        userId="11111111-1111-4111-8111-111111111111"
        currentUserId="11111111-1111-4111-8111-111111111111"
        currentRole="ADMIN"
      />
    );

    expect(screen.getByRole("combobox", { name: "Role" })).toBeDisabled();
  });

  it("updates role and shows success toast", async () => {
    render(
      <RoleSelect
        userId="22222222-2222-4222-8222-222222222222"
        currentUserId="11111111-1111-4111-8111-111111111111"
        currentRole="MEMBER"
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Role" }), {
      target: { value: "ADMIN" },
    });

    await waitFor(() => {
      expect(actionMocks.updateUserRoleAction).toHaveBeenCalledWith(
        "22222222-2222-4222-8222-222222222222",
        "ADMIN"
      );
    });

    expect(toastMocks.success).toHaveBeenCalledWith("Role updated");
  });

  it("shows an error toast when update fails", async () => {
    actionMocks.updateUserRoleAction.mockResolvedValueOnce({ error: "Not allowed" });

    render(
      <RoleSelect
        userId="22222222-2222-4222-8222-222222222222"
        currentUserId="11111111-1111-4111-8111-111111111111"
        currentRole="MEMBER"
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Role" }), {
      target: { value: "ADMIN" },
    });

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("Not allowed");
    });
  });
});
