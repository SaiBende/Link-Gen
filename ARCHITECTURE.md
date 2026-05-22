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
                          Internet
                             │
                  ┌──────────┴──────────┐
                  │   Elastic IP (DNS)  │
                  │   (or ALB DNS)      │
                  └──────────┬──────────┘
                             │
                  ┌──────────▼──────────┐
                  │   EC2 Instance      │
                  │   (t3.micro)        │
                  │                     │
                  │  ┌──────────────┐   │
                  │  │  Docker      │   │
                  │  │              │   │
                  │  │ ┌──────────┐ │   │
                  │  │ │ Dashboard│ │   │
                  │  │ │ :3000    │ │   │
                  │  │ ├──────────┤ │   │
                  │  │ │ Engine   │ │   │
                  │  │ │ :4000    │ │   │
                  │  │ └──────────┘ │   │
                  │  └──────────────┘   │
                  └──────────┬──────────┘
                             │
                  ┌──────────┴──────────┐
                  │   AWS Private Net   │
                  ├─────────────────────┤
                  │  RDS (PostgreSQL)   │
                  │  Valkey (Redis)     │
                  └─────────────────────┘
```

- EC2 runs Docker → both apps in containers
- RDS + Valkey are managed (already running)
- Elastic IP gives you a stable public IP for DNS

### Local — Everything in Containers (same as production)

```bash
docker compose up --build
docker compose exec dashboard npx prisma migrate deploy
```

Dashboard at `http://localhost:3000`, engine at `http://localhost:4000`.

### Production Setup — EC2 + Docker

#### Prerequisites (already done)
- ✅ RDS PostgreSQL running
- ✅ Valkey (Redis) running
- ✅ ECR repos created (optional — you can pull from GitHub directly)

#### Step 1: Launch EC2 Instance

AWS Console → **EC2** → **Instances** → **Launch instance**:

| Setting | Value |
|---|---|
| Name | `redirect-platform-server` |
| AMI | **Ubuntu 22.04 LTS** (free tier) |
| Instance type | **t3.micro** (free tier) |
| Key pair | Create or select an existing one (you'll need the `.pem` file to SSH) |
| Network | **vpc-017fde30e67398c83** (same as RDS + Valkey) |
| Subnet | Choose any public subnet |
| Auto-assign public IP | **Enable** |
| Security group | Create new: **`ec2-sg`** |
| Security group rules | Add: **SSH (22)** from your IP, **HTTP (80)** from `0.0.0.0/0` |
| Storage | **20 GB gp2** (free tier) |

Click **Launch instance**. Wait ~1 min for status to show **Running**.

#### Step 2: Allocate Elastic IP

AWS Console → **EC2** → **Elastic IPs** → **Allocate Elastic IP address** → **Allocate**.

Then select it → **Actions** → **Associate Elastic IP address**:
- Resource type: **Instance**
- Instance: select `redirect-platform-server`
- **Associate**

This gives you a **fixed public IP** that won't change.

#### Step 3: SSH into EC2 & Install Docker

```bash
# From your local terminal (replace path and IP)
ssh -i your-key.pem ubuntu@<elastic-ip>

# Install Docker
sudo apt update
sudo apt install -y docker.io docker-compose-v2

# Add ubuntu user to docker group (no sudo needed)
sudo usermod -aG docker ubuntu

# Log out and back in for group to take effect
exit
ssh -i your-key.pem ubuntu@<elastic-ip>
```

#### Step 4: Clone & Run

```bash
git clone https://github.com/SaiBende/Link-Gen.git
cd Link-Gen

# Create .env file with your AWS endpoints
cat > .env << 'EOF'
DATABASE_URL=postgresql://redirect:redirect@redirect-platform-db.cdmuay6amro4.ap-south-1.rds.amazonaws.com:5432/postgres
REDIS_URL=rediss://redirect-platform-cache-bhapxu.serverless.aps1.cache.amazonaws.com:6379
DEFAULT_HOME_URL=http://<elastic-ip>
REDIRECT_ENGINE_PORT=4000
REDIRECT_DELAY_SECONDS=5
EOF

# Start all containers
docker compose up --build -d

# Run database migrations
docker compose exec dashboard npx prisma migrate deploy
```

#### Step 5: Access

Open `http://<elastic-ip>` in your browser — dashboard loads.

Check engine health: `http://<elastic-ip>:4000/health`

#### Auto-deploy on Git Push

On the EC2 instance, set up a simple auto-deploy:

```bash
# Install the GitHub CLI or just use this cron approach:
crontab -e
```

Add this line:
```
*/5 * * * * cd /home/ubuntu/Link-Gen && git pull --ff-only && docker compose up --build -d 2>&1 | logger
```

This pulls and redeploys every 5 minutes. For instant deploy, use a GitHub webhook + a simple listener, or just SSH in and run `git pull && docker compose up --build -d` manually after each push.

### Required Environment Variables

Set these in the `.env` file on the EC2 or in `docker-compose.yml`:

```
DATABASE_URL=postgresql://redirect:redirect@<rds-endpoint>:5432/postgres
REDIS_URL=rediss://<valkey-endpoint>:6379
DEFAULT_HOME_URL=http://<elastic-ip>
REDIRECT_ENGINE_PORT=4000
REDIRECT_DELAY_SECONDS=5
REDIRECT_PAGE_TITLE=You are being redirected
REDIRECT_PAGE_MESSAGE=Please wait while we take you to your destination.
```

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
