import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { deleteCacheKeys } from "@/lib/cache/redis";
import {
  createLookupKey,
  normalizeNullableRoutePath,
  normalizeNullableSubdomain,
} from "@/lib/routing/lookup";

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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ routeId: string }> },
) {
  const { routeId } = await context.params;
  const body = (await request.json()) as {
    subdomain?: string;
    path?: string;
    destinationUrl?: string;
    status?: "ACTIVE" | "DISABLED";
    matchType?: "EXACT" | "FALLBACK";
    preservePath?: boolean;
    preserveQuery?: boolean;
    redirectType?: number;
  };

  const existing = await prisma.route.findUnique({
    where: { id: routeId },
    select: {
      domainId: true,
      subdomain: true,
      path: true,
      matchType: true,
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "route not found" }, { status: 404 });
  }

  if (body.destinationUrl !== undefined && !isUrl(body.destinationUrl)) {
    return NextResponse.json(
      { error: "destinationUrl must be an http(s) URL" },
      { status: 400 },
    );
  }

  const matchType = body.matchType ?? existing.matchType;
  const subdomain =
    matchType === "FALLBACK"
      ? null
      : body.subdomain === undefined
        ? existing.subdomain
        : normalizeNullableSubdomain(body.subdomain);
  const path =
    matchType === "FALLBACK"
      ? null
      : body.path === undefined
        ? existing.path
        : normalizeNullableRoutePath(body.path);
  const lookupKey = createLookupKey({ matchType, subdomain, path });

  try {
    const redirectType = body.redirectType !== undefined
      ? [301, 302, 307, 308].includes(body.redirectType)
        ? body.redirectType
        : 302
      : undefined;

    const route = await prisma.route.update({
      where: { id: routeId },
      data: {
        subdomain,
        path,
        matchType,
        lookupKey,
        destinationUrl: body.destinationUrl,
        status: body.status,
        preservePath: body.preservePath,
        preserveQuery: body.preserveQuery,
        redirectType,
      },
    });

    await deleteCacheKeys(`routes:${existing.domainId}:*`);

    return NextResponse.json({ route });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "route already exists for this domain" },
        { status: 409 },
      );
    }

    throw error;
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ routeId: string }> },
) {
  const { routeId } = await context.params;
  const existing = await prisma.route.findUnique({
    where: { id: routeId },
    select: { domainId: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "route not found" }, { status: 404 });
  }

  await prisma.route.delete({ where: { id: routeId } });
  await deleteCacheKeys(`routes:${existing.domainId}:*`);

  return NextResponse.json({ deleted: true });
}
