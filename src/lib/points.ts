export const POMODORO_MINUTES_PER_POINT = 25;
export const SET_COMPLETION_BONUS = 2;

export function calculateSessionPoints(durationMin: number, completedSet: boolean): number {
  const base = Math.floor(durationMin / POMODORO_MINUTES_PER_POINT);
  return base > 0 && completedSet ? base + SET_COMPLETION_BONUS : base;
}
