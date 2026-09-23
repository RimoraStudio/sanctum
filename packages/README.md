# Packages

| Package | npm | Purpose |
| --- | --- | --- |
| [`sdk/`](./sdk) | `sanctum-sdk` | TypeScript SDK for the Sanctum REST API |
| [`cli/`](./cli) | `sanctum-cli` | Terminal client (`sanctum`), built on the SDK |

The CLI consumes the SDK via `file:../sdk` for local dev; the publish workflow
(`.github/workflows/publish.yml`) rewrites it to the released version at
release time. Build order: SDK first, then CLI.

