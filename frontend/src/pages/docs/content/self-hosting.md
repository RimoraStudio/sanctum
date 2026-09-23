# Self-Hosting

Sanctum runs self-hosted via Docker Compose or the standalone image.

## Requirements

- PostgreSQL (16+)
- Redis (7+)
- SMTP relay for invites/notifications (optional but recommended)

## Docker Compose (development)

```bash
cp .env.example .env   # fill in keys
docker compose -f docker-compose.dev.yml up
```

Required env vars: `ENCRYPTION_KEY`, `AUTH_SECRET`, `DB_CONNECTION_URI`,
`REDIS_URL`, `SITE_URL`, plus `POSTGRES_*` and `SMTP_*` for mail delivery.

## Standalone image

`Dockerfile.standalone-sanctum` builds a single container with frontend +
backend. `Dockerfile.fips.standalone-sanctum` is the FIPS 140-2 variant for
regulated environments — keep new dependencies FIPS-compatible if you build it.

## Production

`docker-compose.prod.yml` runs backend, Postgres, and Redis. Put a reverse
proxy/TLS terminator in front and set `SITE_URL` to the public URL.

## Migrations

Migrations run automatically at backend startup. To create a new one during
development: `cd backend && npm run migration:new`, then
`npm run generate:schema` to refresh generated types.
