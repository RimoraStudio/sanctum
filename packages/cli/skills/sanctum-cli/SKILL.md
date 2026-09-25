---
name: sanctum-cli
description: Manage secrets with the Sanctum CLI — inject secrets into commands, push/pull .env files, handle binary file secrets, and work with vault-side secret paths. Use whenever secrets, env vars, API keys, .env files, or `sanctum` commands come up, especially in repos containing sanctum-config.json.
---

# Sanctum secrets CLI

This repo uses Sanctum (`sanctum` CLI, npm package `sanctum-cli`) for secrets.
Do NOT create or commit `.env` files with real values. Never paste secret values
into chat, commits, docs, or code.

## Core rules

- `sanctum-config.json` links this directory to a Sanctum project, environment,
  and secret path. It is committed and contains no secrets. Credentials live in
  `~/.sanctum/credentials.json` or env vars — never write them into the config.
- `secretPath` is a vault-side folder namespace, NOT a filesystem path. It only
  mirrors the repo layout by convention (`init` defaults it from the dir name).
- `sanctum run -- <command>` injects secrets as env vars. Prefer it over
  materializing `.env` files: `sanctum run -- npm run dev`, `sanctum run -- npx
  prisma migrate deploy`, etc.
- Secret values stay masked unless a command is explicitly passed `--values`.
  Do not pass it.

## Quick commands

| Command | Purpose |
| --- | --- |
| `sanctum status` | resolved config (project, env, merged paths) |
| `sanctum doctor` | diagnose credentials, auth, project access |
| `sanctum secrets list` / `get` / `set` / `rm` | manage remote secrets |
| `sanctum run -- <cmd>` | run with secrets injected as env vars |
| `sanctum pull [file]` / `push [file]` / `diff` | sync a local .env with remote |
| `sanctum files push <file>` / `pull` / `list` / `diff` | binary file secrets |
| `sanctum folders list` / `create <path> [--all-envs]` | manage vault folders |
| `sanctum agents` / `sanctum skill` | refresh AGENTS.md / install this skill |

## Auth

Commands need credentials: `SANCTUM_BASE_URL` + `SANCTUM_TOKEN`, or
`SANCTUM_CLIENT_ID` + `SANCTUM_CLIENT_SECRET` (Universal Auth machine identity).
If none exist, STOP and ask the user — do not invent tokens. `--profile <name>`
selects a saved credential profile; `--env <slug>` overrides the environment.

## Details

- Full command reference and flag list: `references/commands.md`
- Monorepo layout, config merge order, imports, secretPath semantics:
  `references/monorepo.md`
- Binary file secrets (blob store, KV fallback, sha256, restore paths):
  `references/files.md`
