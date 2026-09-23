# Sanctum

Self-hosted secrets management platform — centralized secret storage, machine
identities, and a CLI/SDK for injecting secrets into apps and CI.

Derived from [Infisical](https://github.com/Infisical/infisical) (MIT), with a
simpler developer experience and a purpose-built CLI. See [NOTICE](./NOTICE).

## What's in the box

- **Dashboard** — projects, environments, secret paths, versioning, secret syncs
- **Machine identities** — Universal Auth (clientId/secret) plus platform
  attestation methods (Kubernetes, AWS, GCP, Azure, OIDC, JWT, TLS, SPIFFE, LDAP)
- **`sanctum-cli`** (`packages/cli`) — link a repo folder to a project, pull/push/diff `.env`
  files, and `sanctum run` to inject secrets at launch. No `.env` needed on disk
- **`sanctum-sdk`** (`packages/sdk`) — TypeScript SDK wrapping the REST API (auth, projects,
  secrets, dotenv utils)

## Quickstart (local dev)

Requires Node 18+, Docker (Postgres + Redis only).

```bash
cp .env.example .env
npm install

npm run dev:db      # Postgres + Redis containers
npm run dev         # backend :4000 + frontend :3000
```

Create an account at http://localhost:3000.

## The CLI

```bash
# build + link
cd packages/sdk && npm install && npm run build
cd ../cli && npm install && npm run build && npm link

# on a dev machine
sanctum login                    # interactive wizard (machine identity or token)

# in your app repo
sanctum init                     # link to a project or create one
sanctum agents                   # drop usage notes into AGENTS.md

sanctum secrets list             # keys only
sanctum secrets set FOO=bar
sanctum diff .env                # masked compare vs remote
sanctum pull                     # fetch remote -> .env
sanctum push .env --dry-run      # preview changes, no writes
sanctum run -- npm run dev       # inject secrets as env vars
```

`sanctum-config.json` is committed (project/env/path only). Credentials live in
`~/.sanctum/credentials.json` per profile, or `SANCTUM_CLIENT_ID` +
`SANCTUM_CLIENT_SECRET` in CI. See [packages/cli](./packages/cli) for the full
command reference and [packages/cli/DEMO.md](./packages/cli/DEMO.md) for a
walkthrough.

## Production

```bash
docker compose -f docker-compose.prod.yml up
```

Or build `Dockerfile.standalone-sanctum` for a single-container deployment.

## License

MIT Expat for the community code, with two carve-outs:

- `ee/` directories — Infisical Enterprise license (not open source; kept for
  upstream compatibility, disabled without a license key)
- `packages/` — MIT, written for this project

See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
