"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { updatePomodoroPreferencesAction } from "@/app/actions/pomodoro";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const schema = z.object({
  workMin: z
    .number({ error: "Work duration is required" })
    .int("Work duration must be a whole number")
    .min(1, "Work duration must be at least 1 minute")
    .max(90, "Work duration must be 90 minutes or fewer"),
  shortBreakMin: z
    .number({ error: "Short break duration is required" })
    .int("Short break duration must be a whole number")
    .min(1, "Short break duration must be at least 1 minute")
    .max(30, "Short break duration must be 30 minutes or fewer"),
  longBreakMin: z
    .number({ error: "Long break duration is required" })
    .int("Long break duration must be a whole number")
    .min(5, "Long break duration must be at least 5 minutes")
    .max(60, "Long break duration must be 60 minutes or fewer"),
});

type FormValues = z.infer<typeof schema>;

interface PomodoroPreferencesFormProps {
  initialWorkMin: number;
  initialShortBreakMin: number;
  initialLongBreakMin: number;
}

export function PomodoroPreferencesForm({
  initialWorkMin,
  initialShortBreakMin,
  initialLongBreakMin,
}: PomodoroPreferencesFormProps) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      workMin: initialWorkMin,
      shortBreakMin: initialShortBreakMin,
      longBreakMin: initialLongBreakMin,
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await updatePomodoroPreferencesAction(values);

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Pomodoro preferences updated");
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <FormField
            control={form.control}
            name="workMin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Work (minutes)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={field.value}
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value, 10);
                      field.onChange(Number.isNaN(value) ? 0 : value);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="shortBreakMin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Short break (minutes)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={field.value}
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value, 10);
                      field.onChange(Number.isNaN(value) ? 0 : value);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="longBreakMin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Long break (minutes)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={5}
                    max={60}
                    value={field.value}
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value, 10);
                      field.onChange(Number.isNaN(value) ? 0 : value);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save timer settings"}
        </Button>
      </form>
    </Form>
  );
}
