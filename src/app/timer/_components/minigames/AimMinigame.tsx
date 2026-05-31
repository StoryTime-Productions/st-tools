import type { GamePosition } from "./types";

type AimMinigameProps = {
  targetPosition: GamePosition;
  onHitTarget: () => void;
};

export function AimMinigame({ targetPosition, onHitTarget }: AimMinigameProps) {
  return (
    <div className="relative h-52 rounded-2xl border border-dashed bg-slate-950/90">
      <button
        type="button"
        aria-label="Tap target"
        className="absolute size-12 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/30"
        style={{
          left: `${targetPosition.x}%`,
          top: `${targetPosition.y}%`,
          transform: "translate(-50%, -50%)",
        }}
        onClick={onHitTarget}
      />
    </div>
  );
}
