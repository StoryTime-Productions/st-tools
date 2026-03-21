import { Button } from "@/components/ui/button";

type FlappyArrowMinigameProps = {
  flappyPipeX: number;
  flappyGapY: number;
  flappyArrowY: number;
  onFlap: () => void;
};

export function FlappyArrowMinigame({
  flappyPipeX,
  flappyGapY,
  flappyArrowY,
  onFlap,
}: FlappyArrowMinigameProps) {
  return (
    <div className="space-y-2">
      <div className="relative h-52 overflow-hidden rounded-2xl border border-dashed bg-slate-950/90">
        <div
          className="absolute w-2 rounded bg-emerald-500"
          style={{ left: `${flappyPipeX}%`, top: 0, height: `${Math.max(0, flappyGapY - 14)}%` }}
        />
        <div
          className="absolute w-2 rounded bg-emerald-500"
          style={{
            left: `${flappyPipeX}%`,
            top: `${flappyGapY + 14}%`,
            height: `${Math.max(0, 100 - (flappyGapY + 14))}%`,
          }}
        />
        <div
          className="absolute text-2xl text-amber-300"
          style={{ left: "14%", top: `${flappyArrowY}%`, transform: "translateY(-50%)" }}
        >
          {">"}
        </div>
      </div>
      <div className="flex justify-center">
        <Button type="button" variant="outline" onClick={onFlap}>
          Flap
        </Button>
      </div>
    </div>
  );
}
