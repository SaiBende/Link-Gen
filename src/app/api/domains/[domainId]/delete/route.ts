import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { deleteCacheKeys } from "@/lib/cache/redis";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ domainId: string }> },
) {
  const { domainId } = await context.params;

  const existing = await prisma.domain.findUnique({
    where: { id: domainId },
    select: { id: true, hostname: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "domain not found" }, { status: 404 });
  }

  await prisma.domain.delete({ where: { id: domainId } });
  await deleteCacheKeys(`routes:${domainId}:*`);

  return NextResponse.json({ deleted: true, hostname: existing.hostname });
}