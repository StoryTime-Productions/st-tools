import type { MinigameChampionSnapshot } from "@/lib/pomodoro";
import { MINIGAME_CONFIG } from "./config";

type ChampionsListProps = {
  champions: MinigameChampionSnapshot[];
};

export function ChampionsList({ champions }: ChampionsListProps) {
  return (
    <div className="space-y-2 rounded-2xl border p-3">
      <p className="text-xs font-medium tracking-[0.2em] uppercase">Champions</p>
      <div className="grid gap-1 text-xs">
        {champions.map((champion) => {
          const gameLabel =
            Object.values(MINIGAME_CONFIG).find((config) => config.key === champion.gameKey)
              ?.label ?? champion.gameKey;

          return (
            <div key={champion.gameKey} className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground truncate">{gameLabel}</span>
              <span className="truncate font-medium">
                {champion.championName} ({champion.championScore})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
