# Sanctum SDK

`sanctum-sdk` is the TypeScript client the CLI is built on. Zero dependencies;
works on any runtime with `fetch` (Node 18+, Bun, Deno, edge workers).

```ts
import { SanctumSdk } from "sanctum-sdk";

const sdk = new SanctumSdk({
  baseUrl: "http://localhost:4000",
  clientId: process.env.SANCTUM_CLIENT_ID,
  clientSecret: process.env.SANCTUM_CLIENT_SECRET
});

await sdk.authenticate(); // Universal Auth

const { secrets } = await sdk.secrets.list({
  projectSlug: "my-app",
  environment: "dev",
  secretPath: "/",
  viewSecretValue: true
});
```

## Modules

- **`sdk.auth`** — `universalAuthLogin`, `renewAccessToken`. `authenticate()`
  uses constructor credentials.
- **`sdk.projects`** — `list`, `get`, `getBySlug`, `create`,
  `listEnvironments`, `getEnvironmentBySlug`.
- **`sdk.secrets`** — `list`, `get`, `create`, `update`, `delete`, `batch`.
  Reads take `workspaceId`/`workspaceSlug` query params; writes take
  `workspaceId`/`projectSlug` in the body.
- **`sdk.dotenv`** — `parseDotenv`, `renderDotenv`, `resolveReferences`
  (`${KEY}` expansion with cycle protection).

## Approvals

Writes may return `{ approval }` instead of `{ secret }` when a change-approval
policy intercepts them. Check `result.approval` before assuming a change
applied.

## Raw requests & errors

`sdk.get/post/patch/del` and `requestRaw` cover endpoints not wrapped yet.
Non-2xx responses throw `SanctumApiError` with `status`, `code`, `message`,
and `response`.

The full reference lives in `packages/sdk/README.md` in the repo.
