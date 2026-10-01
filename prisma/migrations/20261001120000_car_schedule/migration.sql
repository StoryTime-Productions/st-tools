-- Routed (or typed) leave, pick-up and drop-off times per car; see CarSchedule in src/lib/routes.ts.
-- AlterTable
ALTER TABLE "hangout_cars" ADD COLUMN     "schedule" JSONB;

