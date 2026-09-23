# sanctum-sdk

TypeScript SDK for the Sanctum secrets platform. Zero dependencies, works on any
runtime with `fetch` (Node 18+, Bun, Deno, edge workers).

## Install

```bash
npm install sanctum-sdk        # from the registry once published
# or, inside this monorepo:
cd packages/sdk && npm install && npm run build
```

## Quick start

```ts
import { SanctumSdk } from "sanctum-sdk";

const sdk = new SanctumSdk({
  baseUrl: "http://localhost:4000",
  clientId: process.env.SANCTUM_CLIENT_ID,
  clientSecret: process.env.SANCTUM_CLIENT_SECRET
});

await sdk.authenticate(); // Universal Auth -> sets accessToken

const { secrets } = await sdk.secrets.list({
  projectSlug: "my-app",
  environment: "dev",
  secretPath: "/",
  viewSecretValue: true
});
```

## Client options

| Option | Default | Notes |
| --- | --- | --- |
| `baseUrl` | `http://localhost:4000` | Trailing slash is stripped |
| `accessToken` | – | Bearer token for direct auth |
| `clientId` + `clientSecret` | – | Universal Auth; call `authenticate()` |
| `timeout` | `30000` ms | Per-request abort timeout |

`setToken(token)` / `clearToken()` manage the bearer token manually.

## API surface

`sdk` is a `SanctumClient` plus four domain modules.

### `sdk.auth`

| Method | Endpoint | Notes |
| --- | --- | --- |
| `universalAuthLogin({ clientId, clientSecret, organizationSlug? })` | `POST /api/v1/auth/universal-auth/login` | Sets the token and returns `{ accessToken, expiresIn, accessTokenMaxTTL, tokenType }` |
| `renewAccessToken()` | `POST /api/v1/auth/token` | Renew the current token |

`sdk.authenticate()` is a shortcut for `universalAuthLogin` using the
constructor credentials; it throws if `clientId`/`clientSecret` are missing.

### `sdk.projects`

| Method | Endpoint |
| --- | --- |
| `list()` | `GET /api/v1/projects` |
| `get(projectId)` | `GET /api/v1/projects/{id}` |
| `getBySlug(slug)` | `GET /api/v1/projects/slug/{slug}` |
| `create({ projectName, slug?, type?, shouldCreateDefaultEnvs? })` | `POST /api/v1/projects` |
| `listEnvironments(projectId)` | `GET /api/v1/projects/{id}` (reads `environments` off the project) |
| `getEnvironmentBySlug(projectId, envSlug)` | `GET /api/v1/projects/{id}/environments/slug/{slug}` |

`type` accepts `secret-manager` (default), `cert-manager`, `kms`,
`secret-scanning`, `pam`.

### `sdk.secrets`

| Method | Endpoint | Notes |
| --- | --- | --- |
| `list(options)` | `GET /api/v3/secrets/raw` | `options`: `workspaceId`/`workspaceSlug`/`projectSlug`, `environment`, `secretPath`, `viewSecretValue`, `expandSecretReferences`, `recursive`, `include_imports`, `tagSlugs` |
| `get(name, scope)` | `GET /api/v3/secrets/raw/{name}` | scope also accepts `expandSecretReferences`, `version` |
| `create(name, input)` | `POST /api/v3/secrets/raw/{name}` | `input`: scope + `secretValue`, `secretComment?`, `skipMultilineEncoding?` |
| `update(name, input)` | `PATCH /api/v3/secrets/raw/{name}` | scope + `secretValue?`, `secretComment?`, `tags?` |
| `delete(name, scope)` | `DELETE /api/v3/secrets/raw/{name}` | sends the scope as the request body |
| `batch(scope, operations)` | `POST /api/v3/secrets/batch/raw` | operations: `{ type: create\|update\|delete, secretName, ... }` |

Scope fields differ between reads and writes: reads take `workspaceId` /
`workspaceSlug` as query params, writes take `workspaceId` / `projectSlug` in the
body. Passing `projectSlug` works for both.

Write results may return `{ approval }` instead of `{ secret }` when a
change-approval policy intercepts the write. Check `result.approval` before
assuming the change applied.

### `sdk.dotenv`

Pure helpers, no network.

- `parseDotenv(text)` — `KEY=value` lines to an object. Strips quotes, skips
  comments and blank lines.
- `renderDotenv(values)` — object back to dotenv text. Quotes values containing
  spaces/`#`/newlines/quotes; mobile file keys (`GOOGLE_SERVICES_JSON`,
  `*_base64`, keystore/plist names) are never quoted.
- `resolveReferences(values, { prefix = "${", suffix = "}", maxDepth = 10 })` —
  expands `${OTHER_KEY}` references iteratively with cycle protection.

## Raw requests

The client methods are public if you need an endpoint not covered:

```ts
await sdk.get("/api/v1/some/path", { query: { page: 1 } });
await sdk.post("/api/v1/x", { json: true });
await sdk.request("/api/v1/y", { method: "DELETE", body: {...} });
await sdk.requestRaw("/api/v1/file", { raw: true }); // Response
```

`request` returns parsed JSON (or text for `text/plain`), `requestRaw` returns
the `Response`. `raw: true` on `request` skips parsing too.

## Errors

Non-2xx responses throw `SanctumApiError`:

```ts
try {
  await sdk.secrets.get("MISSING", { projectSlug: "app", environment: "dev" });
} catch (err) {
  if (err instanceof SanctumApiError) {
    err.status;   // 404
    err.code;     // server error code, or HTTP_<status>
    err.message;  // server message or statusText
    err.response; // raw payload
  }
}
```

## Used by

`@sanctum/cli` (`../cli`) is built entirely on this SDK and is a good usage
reference.
