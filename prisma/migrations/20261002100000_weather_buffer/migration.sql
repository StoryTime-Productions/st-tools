-- Minutes subtracted from every routed leave time when a stop has a weather warning.
-- AlterTable
ALTER TABLE "hangouts" ADD COLUMN     "weatherBufferMinutes" INTEGER NOT NULL DEFAULT 15;
