-- Carpools: one car per driver per hangout, one ride per member per hangout.
-- CreateTable
CREATE TABLE "hangout_cars" (
    "id" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "startAddress" TEXT,
    "startLat" DOUBLE PRECISION,
    "startLon" DOUBLE PRECISION,
    "commonPoint" TEXT,
    "commonLat" DOUBLE PRECISION,
    "commonLon" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hangoutId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,

    CONSTRAINT "hangout_cars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hangout_riders" (
    "atCommonPoint" BOOLEAN NOT NULL DEFAULT false,
    "hangoutId" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "hangout_riders_pkey" PRIMARY KEY ("hangoutId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "hangout_cars_hangoutId_driverId_key" ON "hangout_cars"("hangoutId", "driverId");

-- CreateIndex
CREATE INDEX "hangout_riders_carId_idx" ON "hangout_riders"("carId");

-- AddForeignKey
ALTER TABLE "hangout_cars" ADD CONSTRAINT "hangout_cars_hangoutId_fkey" FOREIGN KEY ("hangoutId") REFERENCES "hangouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_cars" ADD CONSTRAINT "hangout_cars_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_riders" ADD CONSTRAINT "hangout_riders_hangoutId_fkey" FOREIGN KEY ("hangoutId") REFERENCES "hangouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_riders" ADD CONSTRAINT "hangout_riders_carId_fkey" FOREIGN KEY ("carId") REFERENCES "hangout_cars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_riders" ADD CONSTRAINT "hangout_riders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

