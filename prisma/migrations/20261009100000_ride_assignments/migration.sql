-- CreateEnum
CREATE TYPE "RideDirection" AS ENUM ('PICKUP', 'DROPOFF');

-- CreateEnum
CREATE TYPE "PassengerPointKind" AS ENUM ('HOME', 'RIDER_HOME', 'COMMON');

-- CreateTable
CREATE TABLE "hangout_passengers" (
    "id" TEXT NOT NULL,
    "direction" "RideDirection" NOT NULL,
    "pointKind" "PassengerPointKind" NOT NULL,
    "commonLabel" TEXT,
    "commonLat" DOUBLE PRECISION,
    "commonLon" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hangoutId" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viaUserId" TEXT,

    CONSTRAINT "hangout_passengers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hangout_transit" (
    "id" TEXT NOT NULL,
    "direction" "RideDirection" NOT NULL,
    "startAddress" TEXT NOT NULL,
    "startLat" DOUBLE PRECISION NOT NULL,
    "startLon" DOUBLE PRECISION NOT NULL,
    "destAddress" TEXT,
    "destLat" DOUBLE PRECISION,
    "destLon" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hangoutId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "hangout_transit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hangout_passengers_carId_idx" ON "hangout_passengers"("carId");

-- CreateIndex
CREATE UNIQUE INDEX "hangout_passengers_hangoutId_userId_direction_key" ON "hangout_passengers"("hangoutId", "userId", "direction");

-- CreateIndex
CREATE UNIQUE INDEX "hangout_transit_hangoutId_userId_direction_key" ON "hangout_transit"("hangoutId", "userId", "direction");

-- AddForeignKey
ALTER TABLE "hangout_passengers" ADD CONSTRAINT "hangout_passengers_hangoutId_fkey" FOREIGN KEY ("hangoutId") REFERENCES "hangouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_passengers" ADD CONSTRAINT "hangout_passengers_carId_fkey" FOREIGN KEY ("carId") REFERENCES "hangout_cars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_passengers" ADD CONSTRAINT "hangout_passengers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_passengers" ADD CONSTRAINT "hangout_passengers_viaUserId_fkey" FOREIGN KEY ("viaUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_transit" ADD CONSTRAINT "hangout_transit_hangoutId_fkey" FOREIGN KEY ("hangoutId") REFERENCES "hangouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_transit" ADD CONSTRAINT "hangout_transit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy each existing rider into both lists of the same car (R8). A rider at the
-- car's common point keeps it; everyone else is picked up and dropped at home.
INSERT INTO "hangout_passengers" ("id", "direction", "pointKind", "commonLabel", "commonLat", "commonLon", "hangoutId", "carId", "userId")
SELECT gen_random_uuid()::text, d."direction",
  CASE WHEN r."atCommonPoint" AND c."commonLat" IS NOT NULL AND c."commonLon" IS NOT NULL
       THEN 'COMMON'::"PassengerPointKind" ELSE 'HOME'::"PassengerPointKind" END,
  CASE WHEN r."atCommonPoint" AND c."commonLat" IS NOT NULL AND c."commonLon" IS NOT NULL
       THEN COALESCE(c."commonPoint", 'Common point') END,
  CASE WHEN r."atCommonPoint" AND c."commonLon" IS NOT NULL THEN c."commonLat" END,
  CASE WHEN r."atCommonPoint" AND c."commonLat" IS NOT NULL THEN c."commonLon" END,
  r."hangoutId", r."carId", r."userId"
FROM "hangout_riders" r
JOIN "hangout_cars" c ON c."id" = r."carId"
CROSS JOIN (VALUES ('PICKUP'::"RideDirection"), ('DROPOFF'::"RideDirection")) AS d("direction");
