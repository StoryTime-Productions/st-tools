import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/hub", label: "Overview" },
  { href: "/hub/calendar", label: "Calendar" },
  { href: "/hub/ideas", label: "Ideas" },
] as const;

export function HubTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="Hub" className="border-border/70 flex gap-1 border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.href === active ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab.href === active
              ? "border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground border-transparent"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
