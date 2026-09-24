CREATE TYPE "BackgroundImageStyle" AS ENUM ('STRETCH', 'PATTERN');

ALTER TABLE "users"
ADD COLUMN "foregroundColor" TEXT,
ADD COLUMN "backgroundImageStyle" "BackgroundImageStyle" NOT NULL DEFAULT 'STRETCH';
