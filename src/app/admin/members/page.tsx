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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
        <dl className="grid grid-cols-3 gap-4 px-6 text-center sm:text-left">
          {[
            { label: "Total", value: users.length },
            { label: "Admins", value: adminCount },
            { label: "Members", value: memberCount },
          ].map((stat) => (
            <div key={stat.label} className="space-y-1">
              <dt className="text-muted-foreground text-xs tracking-widest uppercase">
                {stat.label}
              </dt>
              <dd className="text-3xl font-semibold tracking-tight">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="border-border/70 bg-background/85 overflow-hidden rounded-3xl shadow-none">
        <CardHeader className="border-border/60 flex flex-col gap-2 border-b sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden w-14 sm:table-cell">
                  <span className="sr-only">Avatar</span>
                </TableHead>
                <TableHead>Name / Email</TableHead>
                <TableHead className="hidden sm:table-cell">Member since</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="hidden sm:table-cell">
                    <Avatar className="h-9 w-9 rounded-xl">
                      <AvatarImage src={user.avatarUrl ?? undefined} alt="" />
                      <AvatarFallback className="rounded-xl text-xs">
                        {initials(user.name, user.email)}
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>

                  <TableCell>
                    <p className="flex items-center gap-2 font-medium">
                      {user.name ?? "-"}
                      {user.id === currentUser!.id ? <Badge variant="outline">You</Badge> : null}
                    </p>
                    <p className="text-muted-foreground text-xs break-all">{user.email}</p>
                  </TableCell>

                  <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">
                    {user.createdAt.toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>

                  <TableCell>
                    <RoleSelect
                      key={`${user.id}-${user.role}`}
                      userId={user.id}
                      label={user.name ?? user.email}
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
