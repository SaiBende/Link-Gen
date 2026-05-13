# Local Testing And Domain Setup

## Local Redirect Testing

Start the infrastructure:

```bash
docker compose up -d
npm run prisma:migrate
npm run db:seed
```

Start the two app processes in separate terminals:

```bash
npm run dev
```

```bash
npm run dev:redirect
```

The dashboard runs on:

```text
http://localhost:3000
```

The redirect engine runs on:

```text
http://localhost:4000
```

Health check:

```bash
curl http://localhost:4000/health
```

Test seeded root-path routing:

```bash
curl -I -H "Host: example.test" http://localhost:4000/github
```

Expected result:

```text
HTTP/1.1 302 Found
Location: https://github.com/
```

Test seeded subdomain routing:

```bash
curl -I -H "Host: blog.example.test" http://localhost:4000/
```

Expected result:

```text
HTTP/1.1 302 Found
Location: https://medium.com/
```

Test seeded exact subdomain path routing:

```bash
curl -I -H "Host: go.example.test" http://localhost:4000/start
```

Expected result:

```text
HTTP/1.1 302 Found
Location: https://example.com/start
```

## How Users Connect Their Own Domain

1. In the dashboard, create a domain such as:

```text
example.com
```

2. The platform shows a TXT verification record:

```text
Type: TXT
Name: _redirect.example.com
Value: redirect-platform-verification=<token>
```

3. The user opens their DNS provider and adds that TXT record.

4. The user points traffic to the redirect platform.

For root-domain redirects:

```text
Type: A or CNAME/ALIAS
Name: @
Target: your redirect edge host
```

For subdomain redirects:

```text
Type: CNAME
Name: go
Target: your redirect edge host
```

For wildcard subdomain redirects:

```text
Type: CNAME
Name: *
Target: your redirect edge host
```

5. In the dashboard, the user clicks **Check DNS**.

6. After verification succeeds, routes become active.

## Cloudflare Notes

With Cloudflare, the production setup should usually be:

```text
TXT  _redirect   redirect-platform-verification=<token>
CNAME go         edge.yourplatform.com
CNAME *          edge.yourplatform.com
```

For apex/root domains, Cloudflare supports CNAME flattening:

```text
CNAME @          edge.yourplatform.com
```

The redirect engine reads the incoming `Host` header, so every connected domain must ultimately point to the same redirect edge service.
