-- DropForeignKey
ALTER TABLE "minigame_leaderboard_entries" DROP CONSTRAINT "minigame_leaderboard_entries_userId_fkey";

-- DropTable
DROP TABLE "minigame_leaderboard_entries";
