import Link from "next/link";
import { redirect } from "next/navigation";
import { isRecoverySession } from "@/lib/auth-recovery";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data } = await supabase.auth.getClaims();
    // an ordinary signed-in session has nothing to reset, and must not change the password without a reset link
    return isRecoverySession(data?.claims) ? <ResetPasswordForm /> : redirect("/dashboard");
  }

  return (
    <Card className="border-border/70 bg-background/95 w-full max-w-md rounded-3xl text-center shadow-none">
      <CardHeader>
        <CardTitle className="text-2xl" role="heading" aria-level={1}>
          This link has expired
        </CardTitle>
        <CardDescription>
          Reset links work once and only for a short time. Request a new one to continue.
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-center">
        <Button asChild className="w-full">
          <Link href="/auth/forgot-password">Request a new link</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
