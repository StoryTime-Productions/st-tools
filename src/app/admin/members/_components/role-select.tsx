"use client";

import { useState, useTransition } from "react";
import { Role } from "@prisma/client";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { updateUserRoleAction } from "@/app/actions/admin";

interface RoleSelectProps {
  userId: string;
  /** Who the row is about, used for the accessible name and the admin confirmation */
  label: string;
  currentRole: Role;
  /** Prevent self-demotion — the currently logged-in admin's id */
  currentUserId: string;
}

export function RoleSelect({ userId, label, currentRole, currentUserId }: RoleSelectProps) {
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState<Role>(currentRole);
  const [confirm, confirmDialog] = useConfirm();
  const isSelf = userId === currentUserId;

  async function handleChange(value: string) {
    const nextRole = value as Role;
    if (nextRole === role) {
      return;
    }

    // making someone an admin is the one high-impact change, so it asks first
    if (nextRole === Role.ADMIN) {
      const confirmed = await confirm(
        `Admins can change other members' roles and access. Make ${label} an admin?`,
        { title: "Make this member an admin?", confirmLabel: "Make admin" }
      );
      if (!confirmed) {
        return;
      }
    }

    startTransition(async () => {
      const result = await updateUserRoleAction(userId, nextRole);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        setRole(nextRole);
        toast.success(`${label} is now ${nextRole === Role.ADMIN ? "an admin" : "a member"}`);
      }
    });
  }

  return (
    <>
      <Select value={role} onValueChange={handleChange} disabled={isPending || isSelf}>
        <SelectTrigger
          className="w-32"
          aria-label={
            isSelf ? `Role for ${label} (you can't change your own role)` : `Role for ${label}`
          }
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={Role.ADMIN}>Admin</SelectItem>
          <SelectItem value={Role.MEMBER}>Member</SelectItem>
        </SelectContent>
      </Select>
      {confirmDialog}
    </>
  );
}
