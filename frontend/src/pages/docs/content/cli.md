# Sanctum CLI

`sanctum` is the command-line client. It injects secrets into local processes,
syncs `.env` files with remote projects, and manages profiles and config.

Install (from this repo):

```bash
cd packages/sdk && npm install && npm run build
cd ../cli && npm install && npm run build
npm link
```

## Commands

| Command | Description |
| --- | --- |
| `sanctum login` | Wizard or flags: `--token`, `--client-id` + `--client-secret`, `--base-url`, `--profile` |
| `sanctum whoami` | Show profile, identity, org, and token expiry |
| `sanctum profiles` | List saved credential profiles |
| `sanctum init` | Write `sanctum-config.json` (interactive picker or `--project/--env/--path/--imports/--profile`) |
| `sanctum status` | Show resolved config and linked monorepo projects |
| `sanctum projects list` | List accessible projects |
| `sanctum envs` | List environments of the configured project |
| `sanctum secrets list\|get\|set\|rm` | Read/write secrets (`--env`, `--path`, `--profile`) |
| `sanctum export` | Dump merged secrets (`--format dotenv\|json`, `--out`) |
| `sanctum diff` | Masked local-vs-remote comparison (`--values`, `--all`) |
| `sanctum pull` | Merge remote secrets into a local file (`--all`, `--yes`) |
| `sanctum push` | Preview then push `.env` keys (`--dry-run`, `--yes`) |
| `sanctum run -- <cmd>` | Run a command with secrets injected as env vars |
| `sanctum agents` | Append a Sanctum usage section to `./AGENTS.md` |

## Config & credentials

- `sanctum-config.json` (committable) holds project slug, environment,
  secretPath, imports, and profile. Commands walk up from cwd; ancestor configs
  merge root → leaf and the deepest path wins.
- Credentials live in `~/.sanctum/credentials.json` (mode 0600), keyed by
  profile. Resolution: `--profile` > `SANCTUM_PROFILE` > config `"profile"` >
  `"default"`.
- CI auth: `SANCTUM_TOKEN` or `SANCTUM_CLIENT_ID` + `SANCTUM_CLIENT_SECRET`
  (+ `SANCTUM_BASE_URL`).

## Approvals & masking

Writes intercepted by an approval policy report `? queued for approval` with
the approval slug. Values are masked (`ab***yz`) in `diff` and `push` previews
unless `--values` is passed.

The full command reference lives in `packages/cli/FLOWS.md` in the repo.
