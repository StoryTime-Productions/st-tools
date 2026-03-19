import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/get-current-user";
import { Role } from "@prisma/client";
import { WorkspaceShell } from "@/components/layout/workspace-shell";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  // Return 404 (treated as 403) for non-admin users
  if (!user || user.role !== Role.ADMIN) {
    notFound();
  }

  return (
    <WorkspaceShell user={user} activeNav="members" title="Admin">
      {children}
    </WorkspaceShell>
  );
}
