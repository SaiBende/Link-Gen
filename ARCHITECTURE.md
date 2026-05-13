# Redirect Platform Architecture

## MVP Boundary

The MVP is domain routing infrastructure:

- Custom domain records with DNS verification state.
- Root-path redirects such as `domain.com/github`.
- Wildcard subdomain redirects such as `blog.domain.com`.
- Exact subdomain path redirects such as `go.domain.com/start`.
- Fallback routing per domain.
- Basic analytics with route click counters and redirect events.

Authentication, billing, AI features, team management, and enterprise policy controls are intentionally out of scope.

## Services

### Next.js App

The Next.js app owns the management plane:

- `GET /api/domains`
- `POST /api/domains`
- `POST /api/domains/:domainId/verify`
- `GET /api/routes`
- `POST /api/routes`
- `GET /api/analytics`

### Express Redirect Engine

The Express service owns the redirect data plane:

1. Read `Host`.
2. Normalize hostname and path.
3. Find the verified connected domain.
4. Resolve subdomain relative to the connected domain.
5. Load routes from Redis or PostgreSQL.
6. Apply matching priority.
7. Write analytics asynchronously.
8. Return a `302` redirect.

Run it locally with:

```bash
npm run dev:redirect
```

## Matching Priority

The resolver in `src/lib/routing/resolver.ts` applies this order:

1. Exact subdomain + path.
2. Exact subdomain.
3. Root domain + path.
4. Fallback route or domain fallback URL.

Examples:

- `go.domain.com/start` matches `subdomain=go`, `path=/start`.
- `blog.domain.com/anything` matches `subdomain=blog`, `path=null`.
- `domain.com/github` matches `subdomain=null`, `path=/github`.
- Any unmatched request falls through to the fallback route.

## Data Model

`Domain` is the connected hostname and DNS verification container.

`Route` is the redirect rule. `lookupKey` makes route uniqueness explicit even when `subdomain` or `path` are nullable.

`RedirectEvent` is the analytics event stream. Route `clickCount` is denormalized for fast dashboard reads.

## Cache Strategy

Redis caches a domain route bundle for 60 seconds by connected domain and request hostname:

```text
routes:<domainId>:<hostname>
```

Writes invalidate all route bundles for the affected domain.

## Cloudflare Deployment Shape

Use Cloudflare DNS for connected domains:

- TXT record for verification: `_redirect.domain.com`.
- CNAME or proxied record pointed at the redirect edge host.
- Wildcard record `*.domain.com` for wildcard subdomain routing.

The Express redirect engine can be deployed as a low-latency Node service behind Cloudflare. Later, the same resolver contract can move to Workers if the database/cache access pattern is adapted for edge-safe storage.
