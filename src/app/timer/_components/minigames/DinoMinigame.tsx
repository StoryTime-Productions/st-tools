import { Button } from "@/components/ui/button";

type DinoMinigameProps = {
  dinoJumping: boolean;
  dinoObstacleX: number;
  onJump: () => void;
};

export function DinoMinigame({ dinoJumping, dinoObstacleX, onJump }: DinoMinigameProps) {
  return (
    <div className="space-y-2">
      <div className="relative h-52 overflow-hidden rounded-2xl border border-dashed bg-slate-950/90">
        <div className="absolute right-4 bottom-2 text-xs text-slate-300">
          Survive the cactus run
        </div>
        <div
          className="absolute bottom-8 left-[14%] h-8 w-8 rounded bg-emerald-300"
          style={{ bottom: dinoJumping ? "42%" : "2rem" }}
        />
        <div
          className="absolute bottom-8 h-9 w-4 rounded-sm bg-emerald-500"
          style={{ left: `${dinoObstacleX}%` }}
        />
      </div>
      <div className="flex justify-center">
        <Button type="button" variant="outline" onClick={onJump}>
          Jump
        </Button>
      </div>
    </div>
  );
}
