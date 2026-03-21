import type { MinigameId } from "./types";

export const DEFAULT_MINIGAME_KEY = "reaction_tap";

export const MINIGAME_CONFIG: Record<
  MinigameId,
  { label: string; key: string; scoreLabel: string }
> = {
  aim: { label: "Aim trainer", key: DEFAULT_MINIGAME_KEY, scoreLabel: "Hits" },
  dino: { label: "Offline dino", key: "dino_runner", scoreLabel: "Dodges" },
  bricks: { label: "Bricks and ball", key: "brick_breaker", scoreLabel: "Points" },
  flappy: { label: "Flappy arrow", key: "flappy_arrow", scoreLabel: "Pipes" },
  typing: { label: "Shakespeare sprint", key: "typing_scribe", scoreLabel: "Chars" },
  circle: { label: "Circle draw", key: "circle_draw", scoreLabel: "Percent" },
  survivor: { label: "Cursor survivor", key: "cursor_survivor", scoreLabel: "Seconds" },
};

export const SHAKESPEARE_SNIPPET =
  "To be, or not to be, that is the question: Whether 'tis nobler in the mind to suffer the slings and arrows of outrageous fortune.";
