# AGENTS.md — @sanctum/cli

Guidance for AI agents working in this package.

## What this is

Command-line client for the Sanctum secrets platform. Talks to the backend over
`@sanctum/sdk` (local sibling package, consumed via `file:../sdk`).

## Layout

- `src/cli.ts` — every command lives here (`cmdX` functions + the `main()` switch)
- `src/config.ts` — `sanctum-config.json` discovery/merge + `~/.sanctum/credentials.json` profiles
- `src/prompt.ts` — dependency-free TTY pickers (arrow keys) and text input

## Invariants — do not break these

- **`sanctum-config.json` never stores credentials.** Project slug, environment,
  secretPath, imports, profile name only. Credentials live in
  `~/.sanctum/credentials.json` (mode 0600) or env vars.
- **Flags are parsed by position.** `takeFlag`/`hasFlag` mutate the args array.
  For `run`, split at `--` first — child-command args must pass through untouched.
- **Read vs write field names differ on the API.** GET secret endpoints take
  `workspaceId`/`workspaceSlug` as query params; write endpoints take
  `workspaceId`/`projectSlug` in the body; `DELETE` sends a body.
- **Config walk-up merge.** Root configs load first, leaf last; leaf `secretPath`
  wins on key conflicts. `projects` maps in a config register linked children.
- **Secrets values are masked in output** (`maskValue`) unless an explicit
  `--values` flag is passed. Never print full values in list/diff/push preview.

## Build & test

```bash
npm install && npm run build     # tsc -> dist/
npm link                          # puts `sanctum` on PATH
```

Live testing requires a running Sanctum backend (`http://localhost:4000`) and a
Universal Auth machine identity (see `backend/src/db/seed-cli-identity.ts` in the
monorepo).
