import { Input } from "@/components/ui/input";

type TypingSprintMinigameProps = {
  sourceText: string;
  typingValue: string;
  onTypingChange: (value: string) => void;
};

export function TypingSprintMinigame({
  sourceText,
  typingValue,
  onTypingChange,
}: TypingSprintMinigameProps) {
  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-dashed bg-slate-950/90 p-3 text-xs leading-relaxed text-slate-100">
        {sourceText}
      </div>
      <Input
        value={typingValue}
        onChange={(event) => {
          onTypingChange(event.target.value);
        }}
        placeholder="Type continuously..."
      />
      <p className="text-muted-foreground text-xs">
        Keep typing accurately to push your distance farther.
      </p>
    </div>
  );
}
