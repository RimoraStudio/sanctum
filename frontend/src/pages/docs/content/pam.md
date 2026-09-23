# Privileged Access Management (PAM)

Brokered, audited access to infrastructure accounts — databases, servers, and
other privileged resources — without handing out static credentials.

## Core features

- **Accounts** — managed privileged accounts organized in folders. Users
  connect through Sanctum instead of holding the raw password/key.
- **Account templates** — predefined account types (PostgreSQL, SSH, RDP,
  Kubernetes, and more) that standardize connection setup.
- **Discovery** — scan directories and infrastructure (e.g. Active Directory)
  to onboard existing privileged accounts.
- **Sessions** — proxied, recorded sessions to resources. Sessions can be
  viewed live or replayed, with optional AI-generated summaries.
- **Approval requests** — require an approver before access is granted for
  sensitive accounts; temporary access expires automatically.
- **Audit logs** — every access, connection, and approval is recorded.

## Typical flow

1. Create an account template for the resource type.
2. Add or discover accounts.
3. Users request access (optionally gated by approval) and connect via the
   proxied session.
4. Review sessions and audit logs under Monitor.
