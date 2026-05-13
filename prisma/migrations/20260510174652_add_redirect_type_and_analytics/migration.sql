-- AlterTable
ALTER TABLE "RedirectEvent" ADD COLUMN     "browser" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "device" TEXT,
ADD COLUMN     "os" TEXT;

-- AlterTable
ALTER TABLE "Route" ADD COLUMN     "redirectType" INTEGER NOT NULL DEFAULT 302;

-- CreateIndex
CREATE INDEX "RedirectEvent_country_createdAt_idx" ON "RedirectEvent"("country", "createdAt");
