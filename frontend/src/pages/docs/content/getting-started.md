# Getting Started

Sanctum is a self-hosted secrets and security platform. It combines four products
under one organization: Secrets Management, Certificate Manager, KMS, and Secret
Scanning, plus Privileged Access Management (PAM).

## Concepts

- **Organization** — the top-level tenant. Holds users, groups, machine
  identities, roles, audit logs, and SSO settings.
- **Project** — a workspace inside a product. A project has environments (dev,
  staging, prod), secret paths (folders), and its own members/roles.
- **Machine identity** — a non-human credential (Universal Auth, Kubernetes,
  cloud IAM) used by services and CI to authenticate.
- **Secret path** — a folder like `/apps/api` inside a project/environment that
  scopes where secrets live.

## First steps

1. Sign in and create or select an organization.
2. Open **Secrets Management** and create a project.
3. Add secrets under the `dev` environment, or import a `.env` file.
4. Install the CLI (`sanctum login`, `sanctum init`) to inject secrets into
   local development.
5. Create a machine identity (Access Management → Machine Identities) so
   services and CI can fetch secrets without a user login.

## Access control

Sanctum uses permission-based access control at two levels:

- **Organization permissions** govern members, groups, identities, roles, SSO,
  audit logs, and org settings.
- **Project permissions** govern secrets, folders, syncs, rotations, and project
  settings.

The Access Management pages (org sidebar → Administration, or a project's
Administration group) show the same four tabs: Users, Groups, Machine
Identities, Roles. Each tab is only visible if you have read access to it.
