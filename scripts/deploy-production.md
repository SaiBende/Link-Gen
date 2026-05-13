# Production Deployment Guide

## Prerequisites

1. **PostgreSQL Database** - Hosted on Railway, Supabase, AWS RDS, or similar
2. **Redis Cache** - Hosted on Railway, Upstash, or similar
3. **Server** - Vercel (Next.js) + Separate server for redirect engine (or combined)

## Environment Variables

Set these in your production environment:

```env
# Database (required)
DATABASE_URL="postgresql://user:pass@host:5432/dbname?schema=public"

# Redis (required for caching)
REDIS_URL="redis://user:pass@host:6379"

# Redirect Engine Port
REDIRECT_ENGINE_PORT=4000

# App URL (your production domain)
PUBLIC_APP_URL="https://your-domain.com"

# DNS Settings
DNS_TXT_PREFIX="_redirect"
DNS_CNAME_TARGET="edge.your-platform.com"

# Optional: IP Geolocation API
IPAPI_KEY="your-ipapi-key"
```

## Deployment Steps

### Option 1: Vercel + Custom Server

1. **Deploy Next.js Dashboard to Vercel**
   ```bash
   vercel deploy --prod
   ```

2. **Deploy Redirect Engine**
   - Deploy as Docker container or Node.js process
   - Must be accessible at your edge domain

3. **Configure DNS**
   - Point `*.yourplatform.com` to redirect engine IP

### Option 2: Railway (Full Stack)

1. Connect repository to Railway
2. Add PostgreSQL and Redis services
3. Deploy both services:
   - Web service: Next.js app
   - Redirect service: Custom start command

### Option 3: Docker (Self-Hosted)

```bash
# Build production images
docker build -t redirect-platform:latest .
docker build -t redirect-engine:latest -f Dockerfile.redirect .

# Run with production database
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e REDIS_URL="redis://..." \
  redirect-platform:latest

docker run -p 4000:4000 \
  -e DATABASE_URL="postgresql://..." \
  -e REDIS_URL="redis://..." \
  redirect-engine:latest
```

## Post-Deployment Testing

Run the production test script:
```cmd
set PRODUCTION_URL=https://your-redirect-engine.com
set TEST_DOMAIN=your-connected-domain.com
scripts\test-production.bat
```

Or manually test:
```bash
curl -I -H "Host: yourdomain.com" https://your-redirect-engine.com/path
```

Expected response:
```
HTTP/1.1 301/302 Found
Location: https://destination.com
```

## Monitoring

Check these endpoints:
- `/health` - Service health status
- `/api/analytics` - Redirect statistics in dashboard