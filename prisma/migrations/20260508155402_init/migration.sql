-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'DISABLED');

-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "RouteMatchType" AS ENUM ('EXACT', 'FALLBACK');

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "status" "DomainStatus" NOT NULL DEFAULT 'PENDING',
    "verificationToken" TEXT NOT NULL,
    "dnsTxtName" TEXT NOT NULL,
    "dnsTxtValue" TEXT NOT NULL,
    "wildcardEnabled" BOOLEAN NOT NULL DEFAULT false,
    "fallbackUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "subdomain" TEXT,
    "path" TEXT,
    "destinationUrl" TEXT NOT NULL,
    "status" "RouteStatus" NOT NULL DEFAULT 'ACTIVE',
    "matchType" "RouteMatchType" NOT NULL DEFAULT 'EXACT',
    "lookupKey" TEXT NOT NULL,
    "preservePath" BOOLEAN NOT NULL DEFAULT false,
    "preserveQuery" BOOLEAN NOT NULL DEFAULT true,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedirectEvent" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "routeId" TEXT,
    "hostname" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "destination" TEXT,
    "statusCode" INTEGER NOT NULL,
    "referer" TEXT,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedirectEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Domain_hostname_key" ON "Domain"("hostname");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_verificationToken_key" ON "Domain"("verificationToken");

-- CreateIndex
CREATE INDEX "Domain_status_hostname_idx" ON "Domain"("status", "hostname");

-- CreateIndex
CREATE INDEX "Route_domainId_subdomain_path_status_idx" ON "Route"("domainId", "subdomain", "path", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Route_domainId_lookupKey_key" ON "Route"("domainId", "lookupKey");

-- CreateIndex
CREATE INDEX "RedirectEvent_domainId_createdAt_idx" ON "RedirectEvent"("domainId", "createdAt");

-- CreateIndex
CREATE INDEX "RedirectEvent_routeId_createdAt_idx" ON "RedirectEvent"("routeId", "createdAt");

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedirectEvent" ADD CONSTRAINT "RedirectEvent_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedirectEvent" ADD CONSTRAINT "RedirectEvent_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;
