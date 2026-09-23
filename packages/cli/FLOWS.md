# Sanctum CLI — command flows

Every flow in `sanctum`, end to end. Source: `src/cli.ts` (commands), `src/config.ts`
(config + credential resolution), `src/prompt.ts` (TTY pickers).

## Shared mechanics

**Credential resolution** (`loadCredentials` in `config.ts`):

1. `SANCTUM_TOKEN` env var → `{ baseUrl, accessToken }`
2. `SANCTUM_CLIENT_ID` + `SANCTUM_CLIENT_SECRET` env vars → Universal Auth
3. Profile store `~/.sanctum/credentials.json` (mode 0600): `--profile` flag >
   `SANCTUM_PROFILE` > `projectProfiles[projectSlug]` > store `default` > `"default"`
4. `SANCTUM_BASE_URL` overrides the stored base URL (fallback `http://localhost:4000`)

If no credentials resolve, commands die with "Not logged in".

**Config resolution** (`resolveConfig`): walks up from cwd collecting every
`sanctum-config.json`. The nearest file is authoritative for
`projectId`/`projectSlug`/`environment`/`secretPath`. Ancestor configs contribute
their `secretPath` and `imports` to `paths`, ordered root → leaf, so deeper and
more specific paths win on key conflicts. If the nearest config's `projects` map
covers cwd (single-config monorepo), its entry merges in as a synthetic leaf.

**Secret merging** (`fetchMergedSecrets`): for every path in `config.paths`, calls
`secrets.list` with `viewSecretValue`, `expandSecretReferences`, `include_imports`.
Imported secrets merge first, then direct secrets; later paths overwrite earlier
ones.

**Masking**: `maskValue` renders `ab***yz` (`****` for ≤4 chars). Used in `diff`
and `push` previews unless `--values` is passed.

**Approvals**: `upsertSecret` tries create, falls back to update on an
"exists/conflict" API error. If the response carries `approval`, the CLI prints a
`?` line with the approval slug instead of a `✓` — the write is queued, not
applied.

**Arg parsing**: positional `takeFlag`/`hasFlag` mutate the argv array. For `run`,
argv is split at `--` first so child-command args pass through untouched.

---

## `sanctum login`

Stores credentials under a profile.

- Flags: `--token`, `--client-id`, `--client-secret`, `--base-url`, `--profile`
- Non-interactive: `--token` or `--client-id` + `--client-secret` required.
- Interactive (TTY, no flags): 4 steps.
  1. Instance URL (default `http://localhost:4000`)
  2. Method picker: "Machine identity" (clientId + secret, recommended) or "Access token"
  3. Credentials: client ID + masked client secret, or masked token
  4. Profile name (default `default`)
- Universal Auth logins authenticate immediately and store the returned access
  token alongside the clientId/secret (token refresh on expiry is automatic).
- Token logins store the token as-is.

## `sanctum whoami`

Shows the active profile's stored credentials: instance, clientId, decoded JWT
claims (identityId, orgId), and token expiry. Warns when the token is expired
(next call re-authenticates via clientId/secret if present).

## `sanctum profiles`

Lists every saved profile: `*` marks the store default; shows name + baseUrl.
Dies if no profiles exist.

## `sanctum init`

Writes `sanctum-config.json` in cwd and registers it in the nearest ancestor
config's `projects` map (monorepo tracking).

- Flags: `--project <id-or-slug>`, `--env`, `--path`, `--imports a,b`, `--profile`, `--force`
- Non-interactive: `--project` alone is enough (`--env` defaults `dev`, `--path` `/`).
- Interactive: requires a working login.
  1. Project picker: "Link to existing" or "Create new" (new-name defaults from
     `package.json` name > git remote > dir name). Existing projects are sorted
     with a "detected" hint when the local name fuzzy-matches slug/name.
  2. Environment picker from `projects.listEnvironments` (or free input if none).
  3. Secret path (default `/`).
- Existing config prompts to overwrite (TTY) or dies with "use --force" (non-TTY).
- UUID-looking values write `projectId`; slugs write `projectSlug`.

## `sanctum status`

Prints resolved config: project, environment, config file path, merged `paths`,
profile, and the linked `projects` map (dir → slug/path) for monorepos. Local
only, no API calls.

## `sanctum projects list`

Lists every project the credential can access: slug, name, id.

## `sanctum envs`

Lists environments for the configured project (slug + name). Resolves `projectId`
from `projectSlug` via `projects.getBySlug` when needed.

## `sanctum secrets <sub>`

Reads/writes secrets in the resolved scope (`--env`, `--path`, `--profile`
override config).

- `list` — merged key names across all paths (values never printed) + count.
- `get <KEY>` — prints the single secret value.
- `set <KEY>=<value>` — create or update (`upsertSecret`). Value may contain `=`.
  Prints `? queued for approval` when a policy intercepts the write.
- `rm <KEY>` (alias `delete`) — deletes; approval-queued deletions print the
  pending notice.

## `sanctum diff [file]`

Compares a local dotenv file (default `.env`) against merged remote secrets.

- Flags: `--env`, `--values` (unmask), `--all` (skip monorepo picker)
- Output: `+` local-only, `~` changed (masked local/remote values), `-`
  remote-only, plus a totals line.
- Monorepo: when the root config registers linked children, a TTY picker offers
  All / this-directory / per-child; `--all` diffs every child; a file arg diffs
  only cwd. Each child resolves its own config and `.env`.

## `sanctum export`

Dumps merged remote secrets to stdout or a file.

- `--format dotenv` (default, via `sdk.dotenv.renderDotenv`) or `--format json`
- `--out <file>` writes and reports count; otherwise prints.

## `sanctum pull [file]`

Writes remote secrets into a local file (default `.env`; `--out` also works).

- Existing file: merges in place. Matching keys update in place, new remote keys
  append at the end, comments and unrelated lines survive. Reports
  "update N, add M" and asks to apply (TTY); `--yes` / `-y` / `--force` skip.
- Missing file: writes a fresh dotenv render.
- Monorepo: same picker/`--all` behavior as `diff`; each child pulls to its own
  `.env`. Ends with the "keep them out of git" note.

## `sanctum push [file]`

Pushes a dotenv file's keys into the configured `secretPath`.

- Flags: `--env`, `--dry-run`, `--yes`/`-y`, `--path` (via scope), `--profile`
- Dies if the file is missing or has no `KEY=value` pairs.
- Previews against remote: `+` new keys, `~` changed (masked), counts of
  unchanged and remote-only (kept).
- `--dry-run` stops after the preview. Otherwise confirms (TTY), then upserts
  each changed key individually. Approval-intercepted keys report their slug;
  the summary counts pushed vs pending.

## `sanctum run -- <command>`

Injects merged secrets as env vars into a child process.

- Split at `--`: left side takes `--env`/`--profile`; right side is the command.
- Secrets override `process.env` (spread order: env then secrets).
- Warns when zero secrets resolve (wrong env/path is the usual cause).
- Child stdio is inherited; the CLI exits with the child's exit code. On Windows
  it spawns through the shell.

## `sanctum agents`

Appends a "Secrets management (Sanctum)" section to `./AGENTS.md` telling agents
to use `sanctum run`/`diff`/`push` instead of committing `.env` files. No-op if
the section already exists.

## `sanctum version` / `--version` / `-v`

Prints the package version.

## `sanctum` / `help` / `--help` / unknown command

Prints usage. Unknown commands exit 1.

---

## Error paths

- No credentials → "Not logged in" + how to fix.
- No `sanctum-config.json` in cwd or ancestors → "Run `sanctum init` first."
- API errors surface through `SanctumApiError`; create-then-conflict is the only
  case converted to an update, everything else dies with the server message.
- Non-TTY stdin never prompts: missing inputs die with a usage line.
