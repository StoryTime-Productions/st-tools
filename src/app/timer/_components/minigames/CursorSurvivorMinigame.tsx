import type { SurvivorShape } from "./types";

type CursorSurvivorMinigameProps = {
  survivorShapes: SurvivorShape[];
  onMouseMoveArena: (event: React.MouseEvent<HTMLDivElement>) => void;
};

export function CursorSurvivorMinigame({
  survivorShapes,
  onMouseMoveArena,
}: CursorSurvivorMinigameProps) {
  return (
    <div className="space-y-2">
      <div
        className="relative h-52 overflow-hidden rounded-2xl border border-dashed bg-black"
        onMouseMove={onMouseMoveArena}
      >
        {survivorShapes.map((shape) => (
          <div
            key={shape.id}
            className="absolute rounded-sm bg-red-500"
            style={{
              left: `${shape.x}%`,
              top: `${shape.y}%`,
              width: `${shape.width}%`,
              height: `${shape.height}%`,
              opacity: shape.ttl % 2 === 0 ? 0.3 : 0.85,
            }}
          />
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        Stay in the black zone and avoid red flash shapes.
      </p>
    </div>
  );
}
