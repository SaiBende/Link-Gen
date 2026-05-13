import { getCachedJson, setCachedJson } from "../cache/redis";
import { prisma } from "../db/prisma";
import {
  appendRequestParts,
  getSubdomain,
  normalizeHostname,
  normalizePath,
} from "./hostname";
import { isWildcardSubdomain } from "./lookup";
import type { DomainConfig, ResolvedRedirect, RouteConfig } from "./types";

function log(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console[level](JSON.stringify({ timestamp, level, service: "resolver", message, ...meta }));
}

type DomainBundle = {
  domain: DomainConfig;
  routes: RouteConfig[];
};

const CACHE_TTL_SECONDS = 60;

function routeKey(domainId: string, hostname: string) {
  return `routes:${domainId}:${hostname}`;
}

async function findDomain(hostname: string) {
  log("info", "finding_domain", { hostname });

  const exactMatch = await prisma.domain.findFirst({
    where: {
      status: "VERIFIED",
      hostname,
    },
    select: {
      id: true,
      hostname: true,
      fallbackUrl: true,
      wildcardEnabled: true,
    },
  });

  if (exactMatch) {
    log("info", "domain_matched", {
      hostname,
      matchedDomain: exactMatch.hostname,
      wildcard: exactMatch.wildcardEnabled,
    });
    return exactMatch;
  }

  const wildcardDomains = await prisma.domain.findMany({
    where: {
      status: "VERIFIED",
      wildcardEnabled: true,
    },
    select: {
      id: true,
      hostname: true,
      fallbackUrl: true,
      wildcardEnabled: true,
    },
    orderBy: { hostname: "desc" },
  });

  const matched = wildcardDomains.find((domain) =>
    hostname.endsWith(`.${domain.hostname}`),
  );

  if (matched) {
    log("info", "domain_matched", {
      hostname,
      matchedDomain: matched.hostname,
      wildcard: true,
    });
  } else {
    log("warn", "domain_not_found", { hostname, checkedCount: wildcardDomains.length });
  }

  return matched ?? null;
}

async function loadDomainBundle(hostname: string): Promise<DomainBundle | null> {
  const domain = await findDomain(hostname);

  if (!domain) {
    return null;
  }

  const cached = await getCachedJson<DomainBundle>(routeKey(domain.id, hostname));
  if (cached) {
    return cached;
  }

  const routes = await prisma.route.findMany({
    where: {
      domainId: domain.id,
      status: "ACTIVE",
    },
    select: {
      id: true,
      subdomain: true,
      path: true,
      destinationUrl: true,
      preservePath: true,
      preserveQuery: true,
      matchType: true,
      redirectType: true,
    },
  });

  const bundle: DomainBundle = {
    domain: {
      id: domain.id,
      hostname: domain.hostname,
      fallbackUrl: domain.fallbackUrl,
    },
    routes,
  };

  await setCachedJson(routeKey(domain.id, hostname), bundle, CACHE_TTL_SECONDS);

  return bundle;
}

function finalizeMatch(
  domain: DomainConfig,
  route: RouteConfig | null,
  requestPath: string,
  queryString: string,
  matchReason: ResolvedRedirect["matchReason"],
): ResolvedRedirect {
  const destinationUrl = route?.destinationUrl ?? domain.fallbackUrl;

  const result: ResolvedRedirect = {
    domain,
    route,
    destinationUrl: destinationUrl
      ? appendRequestParts(
          destinationUrl,
          requestPath,
          queryString,
          route?.preservePath ?? false,
          route?.preserveQuery ?? true,
        )
      : null,
    statusCode: destinationUrl
      ? ((route?.redirectType === 301 || route?.redirectType === 302
          ? route.redirectType
          : 302) as 301 | 302)
      : 404,
    matchReason,
  };

  log("info", "redirect_resolved", {
    domain: domain.hostname,
    matchReason,
    statusCode: result.statusCode,
    destination: result.destinationUrl,
    routeId: route?.id,
  });

  return result;
}

export async function resolveRedirect(input: {
  host: string;
  pathname: string;
  queryString?: string;
}): Promise<ResolvedRedirect | null> {
  const hostname = normalizeHostname(input.host);
  const requestPath = normalizePath(input.pathname);
  const queryString = input.queryString ?? "";

  log("info", "redirect_request", {
    hostname,
    path: requestPath,
    queryString,
  });

  const bundle = await loadDomainBundle(hostname);

  if (!bundle) {
    log("warn", "redirect_no_domain_bundle", { hostname });
    return null;
  }

  const subdomain = getSubdomain(hostname, bundle.domain.hostname);
  const exactSubdomain = subdomain ?? null;

  log("info", "redirect_matching", {
    hostname,
    subdomain: exactSubdomain,
    path: requestPath,
    routeCount: bundle.routes.length,
  });

  const exactSubdomainPath = bundle.routes.find(
    (route) =>
      route.matchType === "EXACT" &&
      route.subdomain === exactSubdomain &&
      route.path === requestPath,
  );

  if (exactSubdomainPath) {
    return finalizeMatch(
      bundle.domain,
      exactSubdomainPath,
      requestPath,
      queryString,
      "exact-subdomain-path",
    );
  }

  const exactSubdomainRoute =
    exactSubdomain === null
      ? null
      : bundle.routes.find(
          (route) =>
            route.matchType === "EXACT" &&
            route.subdomain === exactSubdomain &&
            route.path === null,
        );

  if (exactSubdomainRoute) {
    return finalizeMatch(
      bundle.domain,
      exactSubdomainRoute,
      requestPath,
      queryString,
      "exact-subdomain",
    );
  }

  const wildcardSubdomainPath = bundle.routes.find(
    (route) =>
      route.matchType === "EXACT" &&
      isWildcardSubdomain(route.subdomain) &&
      route.path === requestPath,
  );

  if (wildcardSubdomainPath) {
    return finalizeMatch(
      bundle.domain,
      wildcardSubdomainPath,
      requestPath,
      queryString,
      "wildcard-subdomain-path",
    );
  }

  const wildcardSubdomainRoute = bundle.routes.find(
    (route) =>
      route.matchType === "EXACT" &&
      isWildcardSubdomain(route.subdomain) &&
      route.path === null,
  );

  if (wildcardSubdomainRoute) {
    return finalizeMatch(
      bundle.domain,
      wildcardSubdomainRoute,
      requestPath,
      queryString,
      "wildcard-subdomain",
    );
  }

  const rootPath = bundle.routes.find(
    (route) =>
      route.matchType === "EXACT" &&
      route.subdomain === null &&
      route.path === requestPath,
  );

  if (rootPath) {
    return finalizeMatch(
      bundle.domain,
      rootPath,
      requestPath,
      queryString,
      "root-path",
    );
  }

  const fallbackRoute = bundle.routes.find(
    (route) => route.matchType === "FALLBACK",
  );

  if (fallbackRoute || bundle.domain.fallbackUrl) {
    return finalizeMatch(
      bundle.domain,
      fallbackRoute ?? null,
      requestPath,
      queryString,
      "fallback",
    );
  }

  return finalizeMatch(
    bundle.domain,
    null,
    requestPath,
    queryString,
    "not-found",
  );
}
