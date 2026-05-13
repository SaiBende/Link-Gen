# Deploy to Free Tier - Complete Guide

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FREE TIER STACK                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────┐    ┌─────────────────────────┐    │
│  │  Vercel         │    │  Render                 │    │
│  │  Next.js        │    │  Redirect Engine        │    │
│  │  Dashboard      │    │  :4000                  │    │
│  │  :3000          │    │                         │    │
│  └────────┬─────────┘    └──────────┬──────────────┘    │
│           │                         │                    │
│           └───────────┬─────────────┘                    │
│                       │                                  │
│           ┌───────────▼───────────┐                     │
│           │    Supabase          │                     │
│           │    PostgreSQL        │                     │
│           │    500MB Free        │                     │
│           └──────────────────────┘                     │
│                       │                                  │
│           ┌───────────▼───────────┐                     │
│           │    Upstash            │                     │
│           │    Redis              │                     │
│           │    10K ops/day Free   │                     │
│           └───────────────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

---

## STEP 1: Supabase (PostgreSQL)

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Create a new project
3. Wait for database to be ready (5-10 min)
4. Go to **Settings > Database**
5. Copy your **Connection string** (URI)
6. It will look like:
   ```
   postgresql://postgres:[PASSWORD]@db.[PROJECT-ID].supabase.co:5432/postgres
   ```

---

## STEP 2: Upstash (Redis)

1. Go to [upstash.com](https://upstash.com) and sign up (free)
2. Create a new Redis database
3. Choose **GLOBAL** region
4. Copy the **Connection URL**:
   ```
   redis://default:[PASSWORD]@.[REGION].upstash.io:6379
   ```

---

## STEP 3: Deploy Redirect Engine to Render

1. Go to [render.com](https://render.com) and sign up (free)
2. Click **New + > Background Worker**
3. Connect your GitHub repo (SaiBende/Link-Gen)
4. Configure:

   | Setting | Value |
   |---------|-------|
   | Name | `redirect-engine` |
   | Branch | `main` |
   | Root Directory | (leave empty) |
   | Build Command | `npm install && npx prisma generate && npm run build` |
   | Start Command | `npx tsx redirect-engine/server.ts` |

5. Add Environment Variables:

   ```
   DATABASE_URL = [Your Supabase URI]
   REDIS_URL = [Your Upstash URL]
   REDIRECT_ENGINE_PORT = 4000
   NODE_ENV = production
   REDIRECT_DELAY_SECONDS = 5
   DEFAULT_HOME_URL = [Your Vercel URL - add later]
   ```

6. Click **Create Background Worker**
7. Wait for deployment (5-10 min)
8. Copy the **Redirect Engine URL** (e.g., `https://redirect-engine.onrender.com`)

---

## STEP 4: Deploy Next.js Dashboard to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up (free)
2. Click **Add New > Project**
3. Import **SaiBende/Link-Gen** from GitHub
4. Configure:

   | Setting | Value |
   |---------|-------|
   | Framework | Next.js |
   | Build Command | `npm run build` |
   | Output Directory | `.next` |

5. Add Environment Variables:

   ```
   DATABASE_URL = [Your Supabase URI]
   REDIS_URL = [Your Upstash URL]
   PUBLIC_APP_URL = [Your Vercel URL]
   ```

6. Click **Deploy**
7. Wait for deployment (2-5 min)
8. Copy your **Vercel URL** (e.g., `https://link-gen.vercel.app`)

---

## STEP 5: Update Redirect Engine

1. Go back to Render
2. Update environment variable:
   ```
   DEFAULT_HOME_URL = https://[your-vercel-app].vercel.app
   ```
3. Redeploy

---

## STEP 6: Run Database Migrations

1. Go to Vercel dashboard
2. Click **Storage > Connect Database**
3. Or run via Supabase SQL Editor:
   - Copy contents of `prisma/migrations/20260508155402_init/migration.sql`
   - Paste into Supabase SQL Editor
   - Click **Run**
   - Repeat for second migration

4. Seed data:
   - Copy contents of `prisma/seed.ts`
   - Paste into Supabase SQL Editor
   - Click **Run**

---

## STEP 7: Update DNS (Production)

Point your domain to the redirect engine:

| Record Type | Name | Value |
|-------------|------|-------|
| CNAME | go | `redirect-engine.onrender.com` |
| CNAME | * | `redirect-engine.onrender.com` |

---

## Test Your Deployment

```bash
# Test redirect engine health
curl https://redirect-engine.onrender.com/health

# Test redirect (use your connected domain)
curl -I -H "Host: your-domain.com" https://redirect-engine.onrender.com/path
```

---

## Update Environment Variable on Render

After deploying to Vercel, update Render with your Vercel URL:

1. Go to Render dashboard
2. Select `redirect-engine`
3. Click **Environment**
4. Update:
   ```
   DEFAULT_HOME_URL = https://[your-vercel-app].vercel.app
   ```
5. Click **Save Changes** - will auto-redeploy

---

## Troubleshooting

### Database Connection Failed
- Check Supabase connection string is correct
- Ensure Supabase IP settings allow Render IP

### Redis Connection Failed
- Check Upstash URL is correct
- Verify Upstash database is active

### Redirect Not Working
- Check `DEFAULT_HOME_URL` is set correctly
- Verify DNS is pointing to Render

### Build Failed
- Ensure all env vars are set on both Vercel and Render
- Check build logs for specific errors