import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

function log(level: "info" | "error", message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console[level](JSON.stringify({ timestamp, level, service: "api", message, ...meta }));
}

export async function GET() {
  try {
    const [totalRedirects, topRoutes, recentEvents] = await Promise.all([
      prisma.redirectEvent.count(),
      prisma.route.findMany({
        orderBy: { clickCount: "desc" },
        take: 10,
        include: {
          domain: {
            select: {
              hostname: true,
            },
          },
        },
      }),
      prisma.redirectEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 25,
        include: {
          domain: {
            select: {
              hostname: true,
            },
          },
          route: {
            select: {
              subdomain: true,
              path: true,
            },
          },
        },
      }),
    ]);

    log("info", "analytics_fetched", {
      totalRedirects,
      topRoutesCount: topRoutes.length,
      recentEventsCount: recentEvents.length,
    });

    return NextResponse.json({ totalRedirects, topRoutes, recentEvents });
  } catch (error) {
    log("error", "analytics_fetch_failed", { error: String(error) });
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
