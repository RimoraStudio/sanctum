# Integrations & Syncs

Push secrets to external platforms and pull configuration from them.

## App Connections

Org-level connections to third-party platforms (AWS, GCP, Azure, GitHub,
GitLab, Heroku, Vercel, Datadog, and more). Created once under Integrations →
App Connections, then referenced by syncs, rotations, and dynamic secrets so
credentials live in one place.

## Secret Syncs

Continuously push a project's secrets to a destination:

- **Cloud secret stores** — AWS Secrets Manager, AWS Parameter Store, GCP
  Secret Manager, Azure Key Vault
- **Platforms** — Vercel, Netlify, Railway, Render, Fly.io, Heroku, Supabase
- **CI/CD** — GitHub Actions, GitLab, CircleCI, Jenkins, TeamCity, Octopus
- **Self-hosted** — HashiCorp Vault, Terraform Cloud, custom webhooks

Options per sync: key schema mapping, whether existing destination secrets get
overwritten, and removal behavior when secrets are deleted upstream.

## Certificate Syncs

Push issued certificates from Certificate Manager to destinations (cloud
secret stores, file-based targets) so TLS certs renew and propagate
automatically.

## Native integrations

Older one-off integrations still work but are deprecated — use Secret Syncs
for new setups.
