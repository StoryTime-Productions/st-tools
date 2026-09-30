-- Home address from the profile, geocoded by TomTom when possible (lat/lon null when not).
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "homeAddress" TEXT,
ADD COLUMN     "homeLat" DOUBLE PRECISION,
ADD COLUMN     "homeLon" DOUBLE PRECISION;

