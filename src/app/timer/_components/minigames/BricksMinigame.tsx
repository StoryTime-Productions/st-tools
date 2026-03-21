import type { BrickState } from "./types";

type BricksMinigameProps = {
  bricks: BrickState[];
  brickBall: { x: number; y: number };
  brickPaddleX: number;
  onMouseMoveArena: (event: React.MouseEvent<HTMLDivElement>) => void;
};

export function BricksMinigame({
  bricks,
  brickBall,
  brickPaddleX,
  onMouseMoveArena,
}: BricksMinigameProps) {
  return (
    <div className="space-y-2">
      <div
        className="relative h-52 overflow-hidden rounded-2xl border border-dashed bg-slate-950/90"
        onMouseMove={onMouseMoveArena}
      >
        {bricks.map((brick, index) =>
          brick.alive ? (
            <div
              key={`${brick.x}-${brick.y}-${index}`}
              className="absolute h-4 rounded-sm bg-cyan-400"
              style={{ left: `${brick.x}%`, top: `${brick.y}%`, width: "18%" }}
            />
          ) : null
        )}

        <div
          className="absolute h-3 rounded-full bg-white"
          style={{ left: `${brickBall.x}%`, top: `${brickBall.y}%`, width: "3%" }}
        />

        <div
          className="absolute bottom-2 h-3 rounded bg-orange-400"
          style={{ left: `${brickPaddleX - 11}%`, width: "22%" }}
        />
      </div>
      <p className="text-muted-foreground text-center text-xs">
        Move your mouse over the arena to control the paddle.
      </p>
    </div>
  );
}
