import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { deleteCacheKeys } from "@/lib/cache/redis";
import {
  createLookupKey,
  normalizeNullableRoutePath,
  normalizeNullableSubdomain,
} from "@/lib/routing/lookup";

function log(level: "info" | "error", message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console[level](JSON.stringify({ timestamp, level, service: "api", message, ...meta }));
}

function isUrl(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const routes = await prisma.route.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        domain: {
          select: {
            hostname: true,
          },
        },
      },
    });

    log("info", "routes_listed", { count: routes.length });
    return NextResponse.json({ routes });
  } catch (error) {
    log("error", "routes_list_failed", { error: String(error) });
    return NextResponse.json({ error: "Failed to fetch routes" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      domainId?: string;
      subdomain?: string;
      path?: string;
      destinationUrl?: string;
      matchType?: "EXACT" | "FALLBACK";
      preservePath?: boolean;
      preserveQuery?: boolean;
      redirectType?: number;
    };

    if (!body.domainId) {
      return NextResponse.json({ error: "domainId is required" }, { status: 400 });
    }

    if (!isUrl(body.destinationUrl)) {
      return NextResponse.json(
        { error: "destinationUrl must be an http(s) URL" },
        { status: 400 },
      );
    }

    const redirectType = body.redirectType === 301 ? 301 : 302;

    const matchType = body.matchType ?? "EXACT";
    const subdomain =
      matchType === "FALLBACK" ? null : normalizeNullableSubdomain(body.subdomain);
    const path =
      matchType === "FALLBACK" ? null : normalizeNullableRoutePath(body.path);
    const lookupKey = createLookupKey({ matchType, subdomain, path });

    const route = await prisma.route.create({
      data: {
        domainId: body.domainId,
        subdomain,
        path,
        destinationUrl: body.destinationUrl!,
        matchType,
        lookupKey,
        preservePath: body.preservePath ?? false,
        preserveQuery: body.preserveQuery ?? true,
        redirectType,
      },
    });

    await deleteCacheKeys(`routes:${body.domainId}:*`);

    log("info", "route_created", {
      routeId: route.id,
      domainId: route.domainId,
      subdomain: route.subdomain,
      path: route.path,
    });

    return NextResponse.json({ route }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      log("error", "route_duplicate", { error: String(error) });
      return NextResponse.json({ error: "route already exists for this domain" }, { status: 409 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      log("error", "route_domain_not_found", { error: String(error) });
      return NextResponse.json({ error: "domain does not exist" }, { status: 404 });
    }

    log("error", "route_create_failed", { error: String(error), stack: error instanceof Error ? error.stack : undefined });
    return NextResponse.json({ error: "Failed to create route" }, { status: 500 });
  }
}
