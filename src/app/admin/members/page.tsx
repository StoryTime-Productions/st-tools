import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/get-current-user";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleSelect } from "./_components/role-select";

export const metadata = { title: "Members – Admin" };

// Opt out of static rendering — list must reflect latest DB state
export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  const [users, currentUser] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    getCurrentUser(),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members ({users.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12" />
              <TableHead>Name / Email</TableHead>
              <TableHead>Member since</TableHead>
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                {/* Avatar */}
                <TableCell>
                  {user.avatarUrl ? (
                    <Image
                      src={user.avatarUrl}
                      alt={user.name ?? user.email}
                      width={32}
                      height={32}
                      className="rounded-full object-cover"
                    />
                  ) : (
                    <div className="bg-muted text-muted-foreground flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold">
                      {(user.name ?? user.email)
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                  )}
                </TableCell>

                {/* Name / email */}
                <TableCell>
                  <p className="font-medium">{user.name ?? "—"}</p>
                  <p className="text-muted-foreground text-xs">{user.email}</p>
                </TableCell>

                {/* Created at */}
                <TableCell className="text-sm">
                  {user.createdAt.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </TableCell>

                {/* Role selector */}
                <TableCell>
                  <RoleSelect
                    userId={user.id}
                    currentRole={user.role}
                    currentUserId={currentUser!.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
