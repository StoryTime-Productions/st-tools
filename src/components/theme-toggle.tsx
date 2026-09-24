"use client";

import { flushSync } from "react-dom";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const actionLabel = "Toggle theme";

  function changeTheme(nextTheme: string) {
    if (
      !("startViewTransition" in document) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setTheme(nextTheme);
      return;
    }

    document.startViewTransition(() => {
      flushSync(() => setTheme(nextTheme));
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="relative rounded-xl"
      aria-label={actionLabel}
      onClick={() => {
        changeTheme(resolvedTheme === "dark" ? "light" : "dark");
      }}
      title={actionLabel}
    >
      <Sun className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
    </Button>
  );
}
