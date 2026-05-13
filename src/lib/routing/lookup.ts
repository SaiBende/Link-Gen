import { normalizeHostname, normalizePath } from "./hostname";

const WILDCARD_SUBDOMAIN = "*";

export function normalizeNullableSubdomain(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeHostname(value);
  return normalized.length > 0 ? normalized : null;
}

export function normalizeNullableRoutePath(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return normalizePath(value);
}

export function isWildcardSubdomain(subdomain: string | null): boolean {
  return subdomain === WILDCARD_SUBDOMAIN;
}

export function createLookupKey(input: {
  matchType: "EXACT" | "FALLBACK";
  subdomain: string | null;
  path: string | null;
}) {
  if (input.matchType === "FALLBACK") {
    return "fallback";
  }

  const subdomainKey = input.subdomain === null
    ? "@root"
    : input.subdomain === WILDCARD_SUBDOMAIN
      ? "@wildcard"
      : input.subdomain;

  return `exact:${subdomainKey}:${input.path ?? "@any"}`;
}
