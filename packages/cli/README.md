# sanctum-cli

Command-line client for the Sanctum secrets platform. Built on
[`sanctum-sdk`](../sdk/README.md).

## Install

```bash
cd packages/sdk && npm install && npm run build   # SDK first — the CLI consumes it via file:../sdk
cd ../cli && npm install && npm run build
npm link            # puts `sanctum` on your PATH
```

## Quick start

```bash
# 1. log in — interactive wizard, or pass credentials
sanctum login
sanctum login --client-id <id> --client-secret <secret> [--profile name]

# 2. link the current directory — pick a project or create one
cd my-app
sanctum init

# 3. use it
sanctum secrets list
sanctum secrets set API_KEY=abc123
sanctum run -- npm run dev
```

## Commands

| Command | Description |
| --- | --- |
| `sanctum login` | 4-step wizard (URL → method → credentials → profile) or `--token` / `--client-id` + `--client-secret` flags |
| `sanctum profiles` | List saved credential profiles |
| `sanctum whoami` | Show profile, identity, org, and token validity |
| `sanctum --version` | Print CLI version |
| `sanctum init [--project x] [--env x] [--path x] [--imports a,b] [--profile x] [--force]` | Write `sanctum-config.json`; interactive picker when flags omitted; refuses to overwrite without `--force` |
| `sanctum status` | Show resolved config + linked monorepo projects |
| `sanctum agents` | Append a Sanctum usage section to `./AGENTS.md` |
| `sanctum projects list` | List accessible projects |
| `sanctum envs` | List environments of the configured project |
| `sanctum secrets list\|get\|set\|rm` | Read/write secrets (`--env`, `--path`, `--profile`); reports queued-for-approval writes |
| `sanctum export [--env x] [--format dotenv\|json] [--out file]` | Dump merged secrets |
| `sanctum diff [file] [--env x] [--values] [--all]` | Masked local-vs-remote comparison; monorepo picker at repo root |
| `sanctum pull [file] [--env x] [--all] [--yes]` | Merge remote secrets into a local file (updates in place, appends new, keeps local-only) |
| `sanctum push [file] [--env x] [--dry-run] [--yes]` | Preview-then-push `.env` keys into your `secretPath` |
| `sanctum run [--env x] -- <cmd>` | Run a command with secrets injected as env vars |

For the full behavior of every command (interactive steps, monorepo pickers,
approval handling, error paths) see [FLOWS.md](./FLOWS.md).

## Config discovery

Commands find the nearest `sanctum-config.json` walking up from the current
directory. Ancestor configs merge in root → leaf order, so a monorepo can keep
shared secrets at the root and per-app folders in subdirectories:

```json
{
  "projectSlug": "my-mono",
  "environment": "dev",
  "secretPath": "/apps/api",
  "imports": ["/shared"],
  "profile": "deploy-bot"
}
```

Merge precedence for keys: root paths first, leaf paths last (deepest wins).

### Monorepo tracking

Run `sanctum init` in a subdirectory of a linked repo and the outermost config
gains a `projects` index:

```json
{
  "projectSlug": "my-mono",
  "secretPath": "/shared",
  "projects": {
    "apps/api": "apps/api/sanctum-config.json",
    "apps/web": "apps/web/sanctum-config.json"
  }
}
```

`sanctum status` at the root lists every linked project; `sanctum diff` and
`sanctum pull` offer a picker (`All` / per-child) or take `--all`.

## CI / non-interactive

All wizards skip prompts when stdin is not a TTY. Pass flags instead, and use
`--yes`/`--force` for confirmation gates (`push`, `pull` into an existing file,
`init` overwrite).

## Credentials

Secrets never go in `sanctum-config.json` — it is safe to commit. Credentials
live in `~/.sanctum/credentials.json` (mode 600), keyed by profile:

```json
{
  "default": "default",
  "profiles": {
    "default": { "baseUrl": "http://localhost:4000", "accessToken": "..." },
    "deploy-bot": { "baseUrl": "...", "clientId": "...", "clientSecret": "..." }
  }
}
```

Resolution order: `--profile` flag > `SANCTUM_PROFILE` env > `sanctum-config.json` `"profile"` > `"default"`.

Env-var auth (CI): `SANCTUM_TOKEN`, or `SANCTUM_CLIENT_ID` + `SANCTUM_CLIENT_SECRET` (+ `SANCTUM_BASE_URL`).
