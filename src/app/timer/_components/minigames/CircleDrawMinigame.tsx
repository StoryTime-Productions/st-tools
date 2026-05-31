import { useRef } from "react";
import type { CirclePoint } from "./types";

type CircleDrawMinigameProps = {
  circlePoints: CirclePoint[];
  onStartDraw: (clientX: number, clientY: number, element: HTMLElement) => void;
  onContinueDraw: (clientX: number, clientY: number, element: HTMLElement) => void;
  onEndDraw: () => void;
};

export function CircleDrawMinigame({
  circlePoints,
  onStartDraw,
  onContinueDraw,
  onEndDraw,
}: CircleDrawMinigameProps) {
  const pointerIdRef = useRef<number | null>(null);

  return (
    <div className="space-y-2">
      <div
        className="relative h-52 overflow-hidden rounded-2xl border border-dashed bg-slate-950/90"
        onPointerDown={(event) => {
          pointerIdRef.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          onStartDraw(event.clientX, event.clientY, event.currentTarget);
        }}
        onPointerMove={(event) => {
          if (pointerIdRef.current !== event.pointerId) {
            return;
          }

          onContinueDraw(event.clientX, event.clientY, event.currentTarget);
        }}
        onPointerUp={(event) => {
          if (pointerIdRef.current === event.pointerId) {
            pointerIdRef.current = null;
          }

          onEndDraw();
        }}
        onPointerCancel={() => {
          pointerIdRef.current = null;
          onEndDraw();
        }}
        onPointerLeave={() => {
          if (pointerIdRef.current === null) {
            return;
          }

          onEndDraw();
        }}
      >
        <div
          className="absolute size-2 rounded-full bg-white"
          style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
        />
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
          {circlePoints.length > 1 ? (
            <polyline
              points={circlePoints.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              stroke="rgb(34, 211, 238)"
              strokeWidth="1.8"
            />
          ) : null}
        </svg>
      </div>
      <p className="text-muted-foreground text-xs">
        Draw one full circle around the white origin point.
      </p>
    </div>
  );
}
