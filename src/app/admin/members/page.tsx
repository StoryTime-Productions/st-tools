import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/get-current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleSelect } from "./_components/role-select";

export const metadata = { title: "Members – Admin" };

// Opt out of static rendering — list must reflect latest DB state
export const dynamic = "force-dynamic";

function initials(name: string | null, email: string): string {
  if (!name) return email[0]?.toUpperCase() ?? "?";

  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default async function AdminMembersPage() {
  const [users, currentUser] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    getCurrentUser(),
  ]);

  const adminCount = users.filter((user) => user.role === "ADMIN").length;
  const memberCount = users.length - adminCount;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardHeader className="space-y-2">
            <CardDescription className="text-xs tracking-[0.24em] uppercase">
              Total members
            </CardDescription>
            <CardTitle className="text-3xl tracking-tight">{users.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardHeader className="space-y-2">
            <CardDescription className="text-xs tracking-[0.24em] uppercase">
              Administrators
            </CardDescription>
            <CardTitle className="text-3xl tracking-tight">{adminCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardHeader className="space-y-2">
            <CardDescription className="text-xs tracking-[0.24em] uppercase">
              Members
            </CardDescription>
            <CardTitle className="text-3xl tracking-tight">{memberCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-border/70 bg-background/85 overflow-hidden rounded-3xl shadow-none">
        <CardHeader className="border-border/60 flex flex-col gap-2 border-b sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Members</CardTitle>
          <Badge variant="outline">{adminCount} admin</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14" />
                <TableHead>Name / Email</TableHead>
                <TableHead>Member since</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <Avatar className="h-9 w-9 rounded-xl">
                      <AvatarImage
                        src={user.avatarUrl ?? undefined}
                        alt={user.name ?? user.email}
                      />
                      <AvatarFallback className="rounded-xl text-xs">
                        {initials(user.name, user.email)}
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>

                  <TableCell>
                    <p className="font-medium">{user.name ?? "-"}</p>
                    <p className="text-muted-foreground text-xs">{user.email}</p>
                  </TableCell>

                  <TableCell className="text-muted-foreground text-sm">
                    {user.createdAt.toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>

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
    </div>
  );
}
