"use client";

import { useTransition } from "react";
import { Role } from "@prisma/client";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateUserRoleAction } from "@/app/actions/admin";

interface RoleSelectProps {
  userId: string;
  currentRole: Role;
  /** Prevent self-demotion — the currently logged-in admin's id */
  currentUserId: string;
}

export function RoleSelect({ userId, currentRole, currentUserId }: RoleSelectProps) {
  const [isPending, startTransition] = useTransition();
  const isSelf = userId === currentUserId;

  function handleChange(value: string) {
    const role = value as Role;
    startTransition(async () => {
      const result = await updateUserRoleAction(userId, role);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Role updated");
      }
    });
  }

  return (
    <Select defaultValue={currentRole} onValueChange={handleChange} disabled={isPending || isSelf}>
      <SelectTrigger className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={Role.ADMIN}>Admin</SelectItem>
        <SelectItem value={Role.MEMBER}>Member</SelectItem>
      </SelectContent>
    </Select>
  );
}
