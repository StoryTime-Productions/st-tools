CREATE TYPE "BackgroundMode" AS ENUM ('NONE', 'COLOR', 'IMAGE');

ALTER TABLE "users"
ADD COLUMN "primaryColor" TEXT,
ADD COLUMN "secondaryColor" TEXT,
ADD COLUMN "backgroundMode" "BackgroundMode" NOT NULL DEFAULT 'NONE',
ADD COLUMN "backgroundColor" TEXT,
ADD COLUMN "backgroundImageUrl" TEXT,
ADD COLUMN "backgroundImageOpacity" INTEGER NOT NULL DEFAULT 45;
