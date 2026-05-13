import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hasVerificationTxtRecord } from "@/lib/dns/verification";
import { deleteCacheKeys } from "@/lib/cache/redis";

function log(level: "info" | "error" | "warn", message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console[level](JSON.stringify({ timestamp, level, service: "api", message, ...meta }));
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ domainId: string }> },
) {
  try {
    const { domainId } = await context.params;

    log("info", "domain_verification_start", { domainId });

    const domain = await prisma.domain.findUnique({ where: { id: domainId } });

    if (!domain) {
      log("warn", "domain_not_found", { domainId });
      return NextResponse.json({ error: "domain not found" }, { status: 404 });
    }

    const verified = await hasVerificationTxtRecord(
      domain.dnsTxtName,
      domain.dnsTxtValue,
    );

    if (!verified) {
      log("info", "domain_verification_failed", {
        domainId,
        hostname: domain.hostname,
        dnsTxtName: domain.dnsTxtName,
      });

      return NextResponse.json(
        {
          verified: false,
          error: "DNS TXT record not found yet. Add the expected TXT record, wait for DNS propagation, then check again.",
          expected: {
            type: "TXT",
            name: domain.dnsTxtName,
            value: domain.dnsTxtValue,
          },
        },
        { status: 409 },
      );
    }

    const updated = await prisma.domain.update({
      where: { id: domain.id },
      data: { status: "VERIFIED" },
    });

    await deleteCacheKeys(`routes:${domain.id}:*`);

    log("info", "domain_verified", {
      domainId: updated.id,
      hostname: updated.hostname,
    });

    return NextResponse.json({ verified: true, domain: updated });
  } catch (error) {
    log("error", "domain_verification_error", {
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
