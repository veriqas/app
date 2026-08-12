# VERIQAS — Deployment Guide

VERIQAS ships as a self-contained Docker Compose stack. This guide covers both
deployment models:

| Mode | Who runs it | Best for |
|------|-------------|----------|
| **Cloud demo (SaaS-style)** | You, on a cloud VM | POCs, evaluations, letting a client click a URL |
| **On-premise** | The client, inside their network | Regulated clients (banks, gov), production |

The **same `docker-compose.yml` runs unchanged in both modes.** The only
differences are the host, the domain, and who owns the server.

> ⚠️ **Deploy on Linux.** VERIQAS is developed on Windows but is deployed on a
> Linux host in every real environment. Do not run the production stack on a
> Windows workstation.

---

## 1. What Gets Deployed

The stack is four containers defined in `docker-compose.yml`:

| Service | Role |
|---------|------|
| `db` | PostgreSQL 16 — all application data (schema: `senqor`) |
| `migrate` | Runs `prisma migrate deploy` once, then exits |
| `app` | Next.js web + API server, listens on port `4000` |
| `worker` | Scan-job poller — claims queued jobs and runs the scanner engines |

Data persists in two named Docker volumes (`db-data`, `worker-tmp`). Nothing is
stored outside Docker.

---

## 2. Prerequisites

A Linux server (Ubuntu 22.04 LTS or similar) with:

- 2 vCPU / 4 GB RAM minimum (4 vCPU / 8 GB recommended once scanners run)
- 40 GB disk
- Docker Engine 24+ and the Compose plugin
- Outbound HTTPS (for the AI remediation feature and for scanners that fetch
  public repos)

Install Docker on a fresh Ubuntu box:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out/in afterwards
```

---

## 3. First Deployment (both modes)

```bash
# 1. Get the code
git clone https://github.com/veriqas/app.git veriqas
cd veriqas

# 2. Create the environment file from the template
cp .env.docker.example .env.docker

# 3. Fill in the required values (see section 4)
nano .env.docker

# 4. Build and start
docker compose up -d --build

# 5. Watch it come up (migrate runs once, then app + worker start)
docker compose ps
docker compose logs -f app
```

When `app` reports it is listening on `4000`, open the server in a browser.

---

## 4. Environment Configuration (`.env.docker`)

Every value below **must** be set before the first start.

```bash
# ── Database ──────────────────────────────────────────────
# Strong password for the bundled PostgreSQL container.
DB_PASSWORD=<generate a strong password>

# ── Authentication ────────────────────────────────────────
# Session-signing secret. Generate with: openssl rand -base64 32
AUTH_SECRET=<openssl rand -base64 32>

# Public URL VERIQAS is served from — NO trailing slash.
#   Cloud demo:  https://demo.veriqas.io
#   On-prem:     https://veriqas.internal.clientcorp.com
AUTH_URL=https://your-domain

# ── App ───────────────────────────────────────────────────
NODE_ENV=production
PORT=4000

# ── Worker ────────────────────────────────────────────────
WORKER_ID=veriqas-worker-1
WORKER_CONCURRENCY=3
POLL_INTERVAL_MS=5000

# ── AI Remediation (optional but recommended) ─────────────
# Enables the "Remediate with AI Agent" feature. Without it,
# remediation jobs cannot run. Get a key from the Anthropic console.
ANTHROPIC_API_KEY=<your Anthropic API key>

# Shared secret guarding the internal remediation-runner endpoint.
# Generate with: openssl rand -hex 16
INTERNAL_SECRET=<openssl rand -hex 16>
```

> 🔐 `.env.docker` contains secrets. It is git-ignored — never commit it.

---

## 5. First-Run Setup (creating the first tenant)

VERIQAS ships with **no seed data**. On first visit it detects an empty database
and redirects to a one-time setup wizard.

1. Open `https://your-domain` — you are redirected to `/setup`.
2. Enter the **organisation name**, **admin email**, and a **password**
   (minimum 10 characters).
3. Submit. This creates the tenant, the organisation, the admin user, and the
   default scoring policy — inside a single transaction.
4. You are sent to `/login`. Sign in with the admin account you just created.
5. On first login, the **guided walkthrough** starts automatically and tours the
   dashboard, sensors, observations, remediation, risks, and compliance.

The `/setup` route is only reachable while the database has zero tenants. Once
the first tenant exists, it is closed and all traffic requires authentication.

---

## 6. Putting It Behind HTTPS

Never expose port `4000` directly. Front the app with a reverse proxy that
terminates TLS. Example with Caddy (automatic Let's Encrypt certificates):

```caddy
# /etc/caddy/Caddyfile
demo.veriqas.io {
    reverse_proxy localhost:4000
}
```

```bash
sudo apt install caddy
sudo systemctl reload caddy
```

Set `AUTH_URL=https://demo.veriqas.io` in `.env.docker` to match, then
`docker compose up -d` to apply.

For on-prem, point the proxy at an internal DNS name and use the client's
internal CA instead of Let's Encrypt.

---

## 7. Mode-Specific Notes

### Cloud demo (SaaS-style)
- Small VM (2 vCPU / 4 GB) is plenty for a demo.
- Use a public subdomain + Let's Encrypt.
- Run the `/setup` wizard yourself to create the demo tenant, then hand the
  client the URL and login.
- Scanners can reach public GitHub repos out of the box.

### On-premise (client's network)
- Deploy on a host **inside** the client's network so scanners can reach their
  internal repos, TLS endpoints, and IP ranges.
- Scan data and findings never leave their infrastructure.
- Use their internal DNS and internal CA for TLS.
- The client owns backups (section 8) and the `.env.docker` secrets.
- No outbound internet is required except for the AI remediation feature — if
  the client forbids outbound calls, leave `ANTHROPIC_API_KEY` unset and the
  rest of the platform runs normally without AI remediation.

---

## 8. Operations

**Update to a new version:**
```bash
git pull
docker compose up -d --build   # migrate re-runs automatically
```

**Back up the database:**
```bash
docker compose exec db pg_dump -U veriqas veriqas > veriqas-backup-$(date +%F).sql
```

**Restore:**
```bash
cat veriqas-backup-YYYY-MM-DD.sql | docker compose exec -T db psql -U veriqas veriqas
```

**View logs:**
```bash
docker compose logs -f app worker
```

**Stop / start:**
```bash
docker compose stop
docker compose up -d
```

---

## 9. Health Checks

Both `app` and `worker` define Docker health checks:

- `app` — polls its own auth session endpoint.
- `worker` — writes a heartbeat file every cycle; unhealthy if stale > 60 s.

Check status:
```bash
docker compose ps        # STATUS column shows healthy/unhealthy
```

---

## 10. Security Checklist Before Going Live

- [ ] `DB_PASSWORD` and `AUTH_SECRET` are strong and unique to this deployment
- [ ] `INTERNAL_SECRET` is set to a random value (not the default)
- [ ] Port `4000` is **not** exposed publicly — only via the TLS proxy
- [ ] `.env.docker` is not committed and is readable only by the deploy user
- [ ] First `/setup` completed and the setup route is confirmed closed
- [ ] Database backups scheduled (section 8)
- [ ] TLS certificate valid and auto-renewing
