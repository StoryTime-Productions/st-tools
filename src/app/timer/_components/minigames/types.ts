export type MinigameId = "aim" | "dino" | "bricks" | "flappy" | "typing" | "circle" | "survivor";

export type GamePosition = { x: number; y: number };
export type BrickState = { x: number; y: number; alive: boolean };
export type CirclePoint = { x: number; y: number };
export type SurvivorShape = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  ttl: number;
};
