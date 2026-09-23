# Access Control & Roles

Sanctum uses permission-based access control (CASL) at organization and project
levels. Every action is a `(action, subject)` pair — e.g. `read` on `secrets`,
`create` on `member`, `edit` on `settings`.

## Where it lives

- **Organization** → sidebar → Administration → **Access Management**:
  Users, Groups, Machine Identities, Roles. Each tab is visible only if you can
  read that subject.
- **Project** → Administration → **Access Management**: the same four tabs,
  scoped to the project.

## Roles

- Built-in roles: **admin**, **member**, plus a **no-access** default for new
  members.
- **Custom roles** — compose any subset of permissions (e.g. "can read secrets
  in dev but not prod") at org or project level.
- **Additional privileges** — temporary or permanent per-user/per-identity
  grants on top of a role. Temporary access expires automatically.
- **Group-derived permissions** — members inherit the union of their groups'
  roles and privileges.

## Enforcement features

- **SSO & MFA enforcement** — require members to authenticate via Google SSO
  and/or complete MFA before accessing the org.
- **IP allowlisting** — restrict identity auth methods to trusted IP ranges.
- **User tokens** — configurable session/token expiration per org.
