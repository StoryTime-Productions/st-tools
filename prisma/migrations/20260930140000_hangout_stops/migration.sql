-- Itinerary stops per hangout; arriveBy is "<day>T<HH:mm>" with day 1 = the locked day (e.g. 2T01:30), cash in cents.
-- CreateEnum
CREATE TYPE "StopType" AS ENUM ('COMMUTE', 'LOCATION', 'RESTAURANT', 'POINT_OF_INTEREST', 'BREAK');

-- CreateTable
CREATE TABLE "hangout_stops" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "StopType" NOT NULL,
    "title" TEXT NOT NULL,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "arriveBy" TEXT,
    "notes" TEXT,
    "bring" TEXT,
    "cashCents" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hangoutId" TEXT NOT NULL,

    CONSTRAINT "hangout_stops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hangout_stops_hangoutId_position_idx" ON "hangout_stops"("hangoutId", "position");

-- AddForeignKey
ALTER TABLE "hangout_stops" ADD CONSTRAINT "hangout_stops_hangoutId_fkey" FOREIGN KEY ("hangoutId") REFERENCES "hangouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

