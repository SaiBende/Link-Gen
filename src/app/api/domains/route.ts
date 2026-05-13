import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createVerificationRecord } from "@/lib/dns/verification";
import { isValidHostname, normalizeDomainInput } from "@/lib/routing/hostname";

function log(level: "info" | "error", message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console[level](JSON.stringify({ timestamp, level, service: "api", message, ...meta }));
}

export async function GET() {
  try {
    const domains = await prisma.domain.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            routes: true,
            events: true,
          },
        },
      },
    });

    log("info", "domains_listed", { count: domains.length });
    return NextResponse.json({ domains });
  } catch (error) {
    log("error", "domains_list_failed", { error: String(error) });
    return NextResponse.json({ error: "Failed to fetch domains" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      hostname?: string;
      fallbackUrl?: string;
      wildcardEnabled?: boolean;
    };

    if (!body.hostname) {
      return NextResponse.json({ error: "hostname is required" }, { status: 400 });
    }

    const hostname = normalizeDomainInput(body.hostname);

    if (!isValidHostname(hostname)) {
      return NextResponse.json(
        { error: "enter a valid domain, for example example.com" },
        { status: 400 },
      );
    }

    const verification = createVerificationRecord(hostname);

    const domain = await prisma.domain.create({
      data: {
        hostname,
        fallbackUrl: body.fallbackUrl || null,
        wildcardEnabled: body.wildcardEnabled ?? true,
        ...verification,
      },
    });

    log("info", "domain_created", { domainId: domain.id, hostname: domain.hostname });
    return NextResponse.json({ domain }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      log("error", "domain_duplicate", { error: String(error) });
      return NextResponse.json({ error: "domain already exists" }, { status: 409 });
    }

    log("error", "domain_create_failed", { error: String(error), stack: error instanceof Error ? error.stack : undefined });
    return NextResponse.json({ error: "Failed to create domain" }, { status: 500 });
  }
}
