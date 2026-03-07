import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/get-current-user";
import { Role } from "@prisma/client";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  // Return 404 (treated as 403) for non-admin users
  if (!user || user.role !== Role.ADMIN) {
    notFound();
  }

  return (
    <div className="bg-background min-h-screen">
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
          <p className="text-muted-foreground text-sm">Manage users and application settings.</p>
        </div>
        {children}
      </div>
    </div>
  );
}
