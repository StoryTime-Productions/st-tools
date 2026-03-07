import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ProfileForm } from "./_components/profile-form";
import { AvatarForm } from "./_components/avatar-form";

export const metadata = { title: "Profile – Settings" };

export default async function ProfileSettingsPage() {
  const user = await getCurrentUser();
  if (!user) notFound();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Profile</h2>
        <p className="text-muted-foreground text-sm">
          Update your display name and profile picture.
        </p>
      </div>

      {/* Avatar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile picture</CardTitle>
        </CardHeader>
        <CardContent>
          <AvatarForm avatarUrl={user.avatarUrl} displayName={user.name} />
        </CardContent>
      </Card>

      {/* Display name */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Display name</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm initialName={user.name} />
        </CardContent>
      </Card>

      <Separator />

      {/* Account info (read-only) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Email</span>
            <span>{user.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Role</span>
            <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{user.role}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Member since</span>
            <span>
              {user.createdAt.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
