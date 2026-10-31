import { CircleAlert } from "lucide-react";

export function AuthError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <p role="alert" className="text-destructive flex items-start gap-2 text-sm">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}
