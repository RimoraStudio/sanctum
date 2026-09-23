# Administration & Platform

## Organization settings

- **General** — name, slug, product toggles (enable/disable products per org),
  secret-share branding.
- **Security** — default membership role, SSO enforcement, MFA enforcement,
  user token expiration, bypass-org-auth for break-glass.
- **Encryption** — KMS/HSM connector settings for platform encryption
  (external key custody).
- **SSO & Provisioning** — SAML, OIDC, LDAP, SCIM, Google Workspace sync.
- **Sub-organizations** — nested orgs (namespaces) with their own members and
  projects for business-unit isolation.

## Server admin console

`/admin` — instance-level settings: general config, environment overview,
resource usage, access management for server admins, and the setup/welcome
flows for fresh installs.

## Project settings

- **Environments** — add/reorder environments (dev, staging, prod, custom).
- **Tags** — shared tag taxonomy for secrets.
- **Policies** — secret naming/validation rules and protected-branch
  (change-approval) policies per environment.
- **Workflow integrations** — approvals connected to external workflows.
- **Webhooks** — HTTP callbacks on secret/folder events.
- **Product settings** — per-product toggles like cross-project secret sharing
  and temporary access defaults.

## Rate limits & quotas

This instance ships with raised default limits (read/write/secrets buckets).
Custom rate-limit profiles can be assigned per org.
