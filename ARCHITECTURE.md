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

### Next.js Dashboard

The Next.js app owns the management plane. It provides a web UI and REST API for managing domains, routes, and viewing analytics.

API routes:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/domains` | List all domains |
| `POST` | `/api/domains` | Create a domain |
| `PATCH` | `/api/domains/:id` | Update domain settings |
| `DELETE` | `/api/domains/:id/delete` | Delete a domain |
| `POST` | `/api/domains/:id/verify` | Trigger DNS verification |
| `GET` | `/api/routes` | List all routes |
| `POST` | `/api/routes` | Create a route |
| `PATCH` | `/api/routes/:id` | Update a route |
| `DELETE` | `/api/routes/:id` | Delete a route |
| `GET` | `/api/analytics` | Fetch aggregate stats and recent events |
| `POST` | `/api/error` | Client-side error logging |

No edge functions are used. All routes run on the default Node.js runtime.

### Express Redirect Engine

A standalone HTTP server that handles live redirect traffic. It resolves incoming requests by reading the `Host` header and matching against configured routes.

Flow:

1. Read `Host` header from request.
2. Normalize hostname and path.
3. Find the verified connected domain.
4. Resolve subdomain relative to the connected domain.
5. Load route bundle from Redis cache (60s TTL) or PostgreSQL.
6. Apply matching priority (exact → wildcard → fallback → 404).
7. Write analytics event asynchronously (Prisma transaction).
8. Return a countdown HTML page that auto-redirects.

Run it locally with:

```bash
npm run dev:redirect
```

## Matching Priority

The resolver in `src/lib/routing/resolver.ts` applies this order:

1. Exact subdomain + path (`blog.domain.com/post`).
2. Exact subdomain, any path (`blog.domain.com/*`).
3. Wildcard subdomain + path (`*.domain.com/post`).
4. Wildcard subdomain, any path (`*.domain.com/*`).
5. Root domain + path (`domain.com/github`).
6. Fallback route or domain fallback URL.
7. Not found (404).

## Data Model

### Domain
Represents a connected custom domain. Stores DNS verification state and fallback URL.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `hostname` | String (unique) | e.g. `example.com` |
| `status` | Enum: PENDING / VERIFIED / DISABLED | Lifecycle state |
| `verificationToken` | String | Random token for DNS proof |
| `dnsTxtName` / `dnsTxtValue` | String | TXT record to add at DNS provider |
| `wildcardEnabled` | Boolean | Allow `*.domain.com` subdomain routing |
| `fallbackUrl` | String? | Default destination when no route matches |

### Route
A single redirect rule linked to a domain.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `domainId` | String (FK) | Cascade delete |
| `subdomain` | String? | `null` = root, `"*"` = wildcard |
| `path` | String? | `null` = any path |
| `destinationUrl` | String | Target URL |
| `matchType` | Enum: EXACT / FALLBACK | FALLBACK = catch-all |
| `lookupKey` | String | Composite key for uniqueness |
| `preservePath` / `preserveQuery` | Boolean | Forward original request parts |
| `redirectType` | Int | 301 or 302 |
| `clickCount` | Int | Denormalized counter |

### RedirectEvent
An analytics event recorded asynchronously on each redirect.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `domainId` | String (FK) | Cascade delete |
| `routeId` | String? (FK) | Set null on route delete |
| `hostname` / `path` | String | Request origin |
| `destination` | String? | Where redirected |
| `statusCode` | Int | 301 / 302 / 404 |
| `ipHash` | String? | SHA-256 of client IP (privacy-safe) |
| `device` / `browser` / `os` | String? | Parsed from user agent |
| `country` | String? | From ipapi.co geolocation |

## Cache Strategy

Redis caches a domain route bundle for 60 seconds, keyed by:

```text
routes:<domainId>:<hostname>
```

- **Read path**: Redirect engine checks Redis first. On miss, loads from PostgreSQL and populates cache.
- **Write path**: Any create/update/delete of domains or routes in the Next.js API calls `deleteCacheKeys()` to invalidate affected cache keys.
- **Resilience**: Cache failures are silently swallowed. PostgreSQL remains the source of truth.

## Deployment

### Architecture (Production)

```
GitHub Push → GitHub Actions → Build & Push to ECR → ECS Fargate
                                                          │
                    ┌─────────────────────────────────────┼────────────────────┐
                    │              AWS VPC                │                    │
                    │                                     │                    │
                    │  ┌──────────────────────────────┐   │                    │
                    │  │     ECS Cluster (Fargate)     │   │                    │
                    │  │                               │   │                    │
                    │  │  ┌──────────┐ ┌────────────┐  │   │                    │
                    │  │  │ Dashboard│ │   Engine   │  │   │                    │
                    │  │  │ :3000    │ │ :4000      │  │   │                    │
                    │  │  └────┬─────┘ └─────┬──────┘  │   │                    │
                    │  └───────┼──────────────┼─────────┘   │                    │
                    │          │              │             │                    │
                    │  ┌───────┴──────────────┴─────────┐   │                    │
                    │  │        AWS Private Network      │   │                    │
                    │  └───────┬──────────────┬─────────┘   │                    │
                    │          │              │             │                    │
                    │  ┌───────▼────┐  ┌──────▼──────┐     │                    │
                    │  │ RDS        │  │ ElastiCache  │     │                    │
                    │  │ PostgreSQL │  │ Redis        │     │                    │
                    │  └────────────┘  └──────────────┘     │                    │
                    └───────────────────────────────────────┘
```

- All 4 containers run on **ECS Fargate** (no EC2 to manage)
- RDS + ElastiCache are managed services (click, done)
- GitHub push → auto-build → auto-deploy via GitHub Actions
- Secrets stored in **AWS SSM Parameter Store** (not hardcoded)

### Local — Everything in Containers (same as ECS)

```bash
docker compose up --build
docker compose exec dashboard npx prisma migrate deploy
```

Dashboard at `http://localhost:3000`, engine at `http://localhost:4000`.

### ECS Setup Guide

#### Step 1: Create AWS Resources (via Console, ~20 min)

**a) ECR repositories (store Docker images):**
```
redirect-platform/dashboard
redirect-platform/engine
```

**b) RDS PostgreSQL:**
- Engine: PostgreSQL 16
- DB instance class: `db.t3.micro` (free tier)
- Public access: No (same VPC as ECS)

**c) ElastiCache Redis:**
- Cluster mode: Disabled
- Node type: `cache.t3.micro`
- Same VPC as ECS

**d) SSM Parameters (for secrets):**
| Parameter Name | Value |
|---|---|
| `/redirect-platform/DATABASE_URL` | `postgresql://user:pass@rds-endpoint:5432/redirect_platform` |
| `/redirect-platform/REDIS_URL` | `redis://redis-endpoint:6379` |
| `/redirect-platform/DEFAULT_HOME_URL` | `http://dashboard-alb-xxxx.us-east-1.elb.amazonaws.com` |

**e) ECS Cluster:**
- Name: `redirect-platform`
- Infrastructure: Fargate (serverless, no EC2)

**f) Application Load Balancer:**
- Create one ALB for both services
- Target group 1 (dashboard): port 3000, health check `/api/error`
- Target group 2 (engine): port 4000, health check `/health`

#### Step 2: Register Task Definitions

```bash
# Replace YOUR_ACCOUNT_ID in the JSON files
aws ecs register-task-definition --cli-input-json file://ecs/task-definition-dashboard.json
aws ecs register-task-definition --cli-input-json file://ecs/task-definition-engine.json
```

#### Step 3: Create ECS Services

Via AWS Console → ECS → `redirect-platform` cluster → Create service:

| Setting | Dashboard | Engine |
|---|---|---|
| Task Definition | `redirect-platform-dashboard` | `redirect-platform-engine` |
| Service Name | `redirect-platform-dashboard` | `redirect-platform-engine` |
| Desired Tasks | 1 | 1 |
| Load Balancer | ALB → target group port 3000 | ALB → target group port 4000 |
| Security Group | Allow port 3000 from ALB | Allow port 4000 from ALB |

#### Step 4: Deploy

```bash
# Push image to ECR (one-time, or let GitHub Actions handle it)
docker build -t <account>.dkr.ecr.us-east-1.amazonaws.com/redirect-platform/dashboard:latest -f Dockerfile .
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/redirect-platform/dashboard:latest

# Run migrations
aws ecs run-task --cluster redirect-platform --task-definition redirect-platform-dashboard --overrides '{"containerOverrides": [{"name": "dashboard", "command": ["npx", "prisma", "migrate", "deploy"]}]}'
```

#### Step 5: Git Push → Auto-deploy

The file `.github/workflows/deploy-ecs.yml` handles:
1. Build Docker images
2. Push to ECR
3. Force new ECS deployment

Configure these GitHub secrets:

| Secret | Value |
|---|---|
| `AWS_ROLE_ARN` | IAM role ARN for GitHub Actions OIDC (or use access keys) |

### Required Environment Variables (SSM Parameters)

Stored in AWS SSM Parameter Store as secure strings:

```
/redirect-platform/DATABASE_URL
/redirect-platform/REDIS_URL
/redirect-platform/DEFAULT_HOME_URL
```

Referenced in task definitions via `secrets` array — never hardcoded.

## Domain DNS Setup

1. **Dashboard**: Point `saibende.dev` (or a subdomain) to your VPS IP or Railway/Render URL.
2. **Redirect Engine**: Point `*.saibende.dev` to the same place (the engine handles routing by `Host` header).
3. **Verification**: TXT record `_redirect.saibende.dev` for domain ownership proof.

## Local Development

```bash
# Terminal 1: Infrastructure
docker compose up -d     # PostgreSQL + Redis

# Terminal 2: Database setup
npm run prisma:migrate
npm run db:seed

# Terminal 3: Next.js dashboard
npm run dev              # http://localhost:3000

# Terminal 4: Redirect engine
npm run dev:redirect     # http://localhost:4000
```

The dashboard displays test curl commands targeting `localhost:4000` for local testing.
