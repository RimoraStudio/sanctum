# sanctum command reference

Global flags: `--env <slug>` (secrets/diff/pull/push/run/folders/files),
`--path /x` (secrets, files, diff, pull, push, export), `--profile <name>`.

| Command | Usage |
| --- | --- |
| `setup` | `sanctum setup [--base-url x] [--browser\|--token\|--client-id/--client-secret] [--project x] [--env x] [--path /x] [--all-envs] [--no-agents] [--profile name]` — one-shot login + init + AGENTS.md |
| `login` | `sanctum login [--browser] \| --token <t> \| --client-id <id> --client-secret <s> [--base-url <url>] [--profile name]` |
| `profiles` | `sanctum profiles` lists profiles; `sanctum profiles use` binds one to this project |
| `init` | `sanctum init [--project <id-or-slug>] [--env dev] [--path /apps/api] [--imports /shared]` — interactive picker without --project; `--all` links child dirs |
| `projects list` | list visible projects |
| `status` | resolved config + linked monorepo projects + local .env drift |
| `doctor` | credentials, instance reachability, auth, project visibility |
| `envs` | list environment slugs |
| `folders` | `folders create <path> [--env x] [--all-envs]` / `folders list [--env x] [--path /x]` — nested paths ok, idempotent |
| `files` | `files push <file>` / `pull [--to dir] [--force]` / `list` / `diff` — see files.md |
| `secrets` | `secrets list [--exact]` / `get <KEY> [--file out]` / `set <KEY>=<v>` / `set <KEY> --file <bin>` / `rm <KEY> [--yes]` |
| `export` | `export [--format dotenv\|json] [--out file]` |
| `diff` | `diff [file] [--values] [--all]` |
| `pull` | `pull [file] [--all] [--yes]` |
| `push` | `push [file] [--dry-run] [--yes]` |
| `run` | `run -- <cmd>` injects secrets as env vars |

## Agent rules

- All non-interactive: every prompt has a flag. `sanctum setup --project <slug>
  --env dev --path /x` is the one-shot path.
- `secrets rm` prompts; pass `--yes` for scripted deletes.
- `push` supports `--dry-run` to preview writes before applying.
- Writes may return "queued for approval" when the project has a change-approval
  policy — the secret is NOT live until approved in the web UI. Surface this.
- Unknown flags produce warnings, not silent acceptance — re-read the command.
