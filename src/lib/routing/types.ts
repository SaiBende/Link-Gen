export type DomainConfig = {
  id: string;
  hostname: string;
  fallbackUrl: string | null;
};

export type RouteConfig = {
  id: string;
  subdomain: string | null;
  path: string | null;
  destinationUrl: string;
  preservePath: boolean;
  preserveQuery: boolean;
  matchType: "EXACT" | "FALLBACK";
  redirectType: number;
};

export type ResolvedRedirect = {
  domain: DomainConfig;
  route: RouteConfig | null;
  destinationUrl: string | null;
  statusCode: 301 | 302 | 404;
  matchReason:
    | "exact-subdomain-path"
    | "exact-subdomain"
    | "wildcard-subdomain-path"
    | "wildcard-subdomain"
    | "root-path"
    | "fallback"
    | "not-found";
};
