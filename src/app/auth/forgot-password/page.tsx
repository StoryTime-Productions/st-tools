"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { requestPasswordResetAction } from "@/app/actions/auth";
import { callbackErrorMessage } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { AuthError } from "../_components/auth-error";

const schema = z.object({
  email: z.string().email("Invalid email address"),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(
    callbackErrorMessage(searchParams.get("error"))
  );
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const result = await requestPasswordResetAction(values);
    if (result && "error" in result) {
      setServerError(result.error);
    } else {
      setSentTo(values.email);
    }
  }

  if (sentTo) {
    return (
      <Card className="border-border/70 bg-background/95 w-full max-w-md rounded-3xl text-center shadow-none">
        <CardHeader>
          <CardTitle className="text-2xl" role="heading" aria-level={1}>
            Check your email
          </CardTitle>
          <CardDescription role="status">
            If an account exists for{" "}
            <span className="text-foreground font-medium break-all">{sentTo}</span>, we sent a link
            to reset your password. It can take a few minutes to arrive.
          </CardDescription>
        </CardHeader>
        <CardFooter className="text-muted-foreground border-border/60 flex-col justify-center gap-1 border-t text-sm">
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className="text-foreground inline-flex min-h-11 items-center underline underline-offset-4 hover:no-underline"
          >
            Use a different email
          </button>
          <Link
            href="/auth/sign-in"
            className="text-foreground inline-flex min-h-11 items-center underline underline-offset-4 hover:no-underline"
          >
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 bg-background/95 w-full max-w-md rounded-3xl shadow-none">
      <CardHeader>
        <CardTitle className="text-2xl" role="heading" aria-level={1}>
          Reset your password
        </CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a link to choose a new password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <AuthError message={serverError} />
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="text-muted-foreground border-border/60 justify-center border-t text-sm">
        <Link
          href="/auth/sign-in"
          className="text-foreground inline-flex min-h-11 items-center underline underline-offset-4 hover:no-underline"
        >
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
