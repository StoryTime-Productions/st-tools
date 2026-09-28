-- Availability setup on hangouts: chosen dates, daily hour window, optional deadline.
-- AlterTable
ALTER TABLE "hangouts" ADD COLUMN     "availabilityDates" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "availabilityDeadline" TIMESTAMP(3),
ADD COLUMN     "windowEndHour" INTEGER NOT NULL DEFAULT 17,
ADD COLUMN     "windowStartHour" INTEGER NOT NULL DEFAULT 9;
