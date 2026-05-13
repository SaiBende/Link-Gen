export function normalizeHostname(host: string) {
  return host
    .split(":")[0]
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
}

export function normalizeDomainInput(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(
      trimmed.includes("://") ? trimmed : `https://${trimmed}`,
    );

    return normalizeHostname(url.hostname);
  } catch {
    return normalizeHostname(trimmed.split("/")[0]);
  }
}

export function isValidHostname(hostname: string) {
  if (hostname.length < 3 || hostname.length > 253) {
    return false;
  }

  if (!hostname.includes(".")) {
    return false;
  }

  return hostname
    .split(".")
    .every((label) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

export function normalizePath(pathname: string) {
  const pathnameOnly = pathname.split("?")[0] || "/";
  const withLeadingSlash = pathnameOnly.startsWith("/")
    ? pathnameOnly
    : `/${pathnameOnly}`;

  if (withLeadingSlash === "/") {
    return "/";
  }

  return withLeadingSlash.replace(/\/+$/, "");
}

export function getSubdomain(hostname: string, rootDomain: string) {
  if (hostname === rootDomain) {
    return null;
  }

  const suffix = `.${rootDomain}`;
  if (!hostname.endsWith(suffix)) {
    return null;
  }

  return hostname.slice(0, -suffix.length);
}

export function appendRequestParts(
  destinationUrl: string,
  requestPath: string,
  queryString: string,
  preservePath: boolean,
  preserveQuery: boolean,
) {
  const destination = new URL(destinationUrl);

  if (preservePath && requestPath !== "/") {
    destination.pathname = `${destination.pathname.replace(/\/$/, "")}${requestPath}`;
  }

  if (preserveQuery && queryString) {
    const incoming = new URLSearchParams(queryString);
    incoming.forEach((value, key) => destination.searchParams.append(key, value));
  }

  return destination.toString();
}
