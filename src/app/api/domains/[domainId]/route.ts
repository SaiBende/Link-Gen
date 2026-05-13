import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { deleteCacheKeys } from "@/lib/cache/redis";

function isNullableUrl(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return true;
  }

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
  context: { params: Promise<{ domainId: string }> },
) {
  const { domainId } = await context.params;
  const body = (await request.json()) as {
    fallbackUrl?: string | null;
    wildcardEnabled?: boolean;
    status?: "PENDING" | "VERIFIED" | "DISABLED";
  };

  const existing = await prisma.domain.findUnique({
    where: { id: domainId },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "domain not found" }, { status: 404 });
  }

  if (!isNullableUrl(body.fallbackUrl)) {
    return NextResponse.json(
      { error: "fallbackUrl must be empty or an http(s) URL" },
      { status: 400 },
    );
  }

  const domain = await prisma.domain.update({
    where: { id: domainId },
    data: {
      fallbackUrl:
        body.fallbackUrl === undefined || body.fallbackUrl === ""
          ? body.fallbackUrl === ""
            ? null
            : undefined
          : body.fallbackUrl,
      wildcardEnabled: body.wildcardEnabled,
      status: body.status,
    },
  });

  await deleteCacheKeys(`routes:${domainId}:*`);

  return NextResponse.json({ domain });
}
