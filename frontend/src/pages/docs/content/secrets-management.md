# Secrets Management

Centralize application secrets across environments. Secrets live in projects,
organized by environment (dev, staging, prod) and secret path (folder).

## Core features

- **Secrets & folders** — CRUD with per-secret comments, tags, and metadata.
  Personal overrides let a user keep a local value without changing the shared
  one.
- **Secret references & imports** — reference `${OTHER_KEY}` values across
  paths and import shared folders into multiple projects.
- **Versioning & commit history** — every change is a commit. Open the commit
  history from the environment column menu or the commits badge to diff,
  inspect, restore, or revert changes.
- **Point-in-time recovery** — snapshot-based recovery of a folder or project
  to an earlier state.
- **Secret approvals** — require review before writes take effect. Queued
  changes appear under Approvals.
- **Secret rotation** — automatically rotate credentials (database passwords,
  cloud keys) on a schedule.
- **Dynamic secrets** — generate short-lived credentials on demand; leases
  expire and are revoked automatically.
- **Secret syncs** — push secrets to external platforms (AWS, GCP, Azure,
  Vercel, GitHub, GitLab, and more) and keep them in sync.
- **Honey tokens** — plant decoy secrets and get alerted when they are read.
- **Secret sharing** — share a secret via an expiring external link.
- **Secret scanning hooks** — block commits that would expose values.

## Common workflows

**Inject secrets into a process**

```bash
sanctum run -- npm run dev
```

**Sync local .env with remote**

```bash
sanctum diff      # preview differences
sanctum pull      # remote -> local
sanctum push      # local -> remote
```

**Service access (CI/production)**

Create a machine identity under Access Management → Machine Identities, attach
Universal Auth, then use the SDK or API with the client ID and secret.
