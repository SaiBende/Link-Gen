import { createHash } from "node:crypto";
import { prisma } from "../db/prisma";
import type { ResolvedRedirect } from "../routing/types";
import useragent from "useragent";

function log(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console[level](JSON.stringify({ timestamp, level, message, ...meta }));
}

function hashIp(ip: string | null) {
  if (!ip) {
    return null;
  }

  return createHash("sha256").update(ip).digest("hex");
}

function parseUserAgent(ua: string | null) {
  if (!ua) {
    return { device: "unknown", browser: "unknown", os: "unknown" };
  }

  try {
    const agent = useragent.parse(ua);

    const device = agent.device.family !== "Other"
      ? agent.device.family
      : agent.os.family !== "Other"
        ? agent.os.family
        : "desktop";

    return {
      device: device.toLowerCase(),
      browser: agent.family.toLowerCase(),
      os: agent.os.family.toLowerCase(),
    };
  } catch (error) {
    log("warn", "user_agent_parse_failed", { ua: ua.slice(0, 100), error: String(error) });
    return { device: "unknown", browser: "unknown", os: "unknown" };
  }
}

async function lookupCountry(ip: string | null): Promise<string | null> {
  if (!ip || ip === "127.0.0.1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return null;
  }

  const apiKey = process.env.IPAPI_KEY;
  const url = apiKey
    ? `https://ipapi.co/${ip}/json/?key=${apiKey}`
    : `http://ipapi.co/${ip}/json/`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });

    if (response.ok) {
      const data = (await response.json()) as { country_code?: string };
      return data.country_code ?? null;
    }
  } catch (error) {
    log("warn", "country_lookup_failed", { ip, error: String(error) });
  }

  return null;
}

export async function recordRedirectEvent(input: {
  resolved: ResolvedRedirect;
  hostname: string;
  path: string;
  referer: string | null;
  userAgent: string | null;
  ip: string | null;
}) {
  const { device, browser, os } = parseUserAgent(input.userAgent);
  const country = await lookupCountry(input.ip);

  try {
    await prisma.$transaction([
      prisma.redirectEvent.create({
        data: {
          domainId: input.resolved.domain.id,
          routeId: input.resolved.route?.id,
          hostname: input.hostname,
          path: input.path,
          destination: input.resolved.destinationUrl,
          statusCode: input.resolved.statusCode,
          referer: input.referer,
          userAgent: input.userAgent,
          ipHash: hashIp(input.ip),
          device,
          browser,
          os,
          country,
        },
      }),
      ...(input.resolved.route
        ? [
            prisma.route.update({
              where: { id: input.resolved.route.id },
              data: { clickCount: { increment: 1 } },
            }),
          ]
        : []),
    ]);

    log("info", "analytics_recorded", {
      routeId: input.resolved.route?.id,
      statusCode: input.resolved.statusCode,
      device,
      browser,
      country,
    });
  } catch (error) {
    log("error", "analytics_record_failed", {
      hostname: input.hostname,
      path: input.path,
      error: String(error),
    });
  }
}
