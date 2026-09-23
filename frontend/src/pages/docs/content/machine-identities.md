# Machine Identities & Auth

Machine identities are non-human credentials for services, CI pipelines, and
automation. They authenticate to the API without a user session.

## Auth methods

| Method | Use case |
| --- | --- |
| **Universal Auth** | Client ID + secret. Simple, works anywhere — the default for CI and the CLI |
| **Kubernetes** | In-cluster service account token verification |
| **AWS IAM** | IAM role/identity ARNs — no stored secrets |
| **Azure** | Azure managed identity / service principal |
| **GCP** | GCP service account identity |
| **OIDC** | JWT-based auth for generic providers |
| **TLS/certificates** | Mutual TLS identity via CA-issued certs |
| **JWT** | Bring-your-own signed JWT validation |
| **Token auth** | Long-lived access token for simple setups |

## Configuration

- **Trusted IPs** — restrict which source IPs can authenticate.
- **Token TTLs** — cap access token lifetime; Universal Auth supports renewal.
- **Auth templates** — org-level templates that standardize identity auth
  configuration across projects.
- **Permissions** — identities get project roles/privileges like users; scope
  them to specific environments and secret paths.

## Usage

```bash
sanctum login --client-id <id> --client-secret <secret>
```

Or via SDK/API: `POST /api/v1/auth/universal-auth/login` → bearer token.
