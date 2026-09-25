# Secret paths and monorepo layout

## secretPath is vault-side, not filesystem

`secretPath` is a folder namespace on the Sanctum server — `/mrhr-api` never maps
to `./mrhr-api` on disk. It mirrors the repo layout only by convention (`init`
defaults it from the directory name). Secrets and files share the namespace;
`secrets list` hides file secrets, `files list` shows only files.

The merged view walks ancestor paths: a leaf at `/apps/api` inherits keys from
`/` and `/apps`. `secrets list --exact` shows only the leaf path.

## Config discovery and merge

Commands read the nearest `sanctum-config.json` upward from cwd. Configs merge
root-to-leaf: ancestor `secretPath` and `imports` act as shared secrets, and the
leaf wins on key conflicts.

```json
{ "projectSlug": "my-app", "environment": "dev", "secretPath": "/apps/api", "imports": ["/shared"] }
```

- `imports: ["/shared"]` pulls an extra remote path into the merge.
- `projects` maps register linked children:
  `"projects": { "apps/api": { "projectSlug": "...", "secretPath": "/apps/api" } }`.

## Monorepo workflow

- `sanctum init --all --project <slug>` at the root writes the root config and
  links every child dir containing a package.json or .env to `/<dirname>`.
- `sanctum init` inside a child dir auto-registers it in the root config.
- `sanctum pull --all` / `sanctum diff --all` iterate every registered child.

## Writes

The configured `secretPath` is auto-created on write, so `sanctum push` and
`secrets set` just work. Use `folders create /x --all-envs` only to provision
paths ahead of time or across environments.

## When a tool needs a real .env file

Some tools read a file, not process env (Prisma CLI, some Docker setups). Use
`sanctum pull .env` or `sanctum export --out .env` to materialize one, add
`.env` to `.gitignore`, treat it as disposable. `sanctum run -- <cmd>` is
preferred whenever the tool honors process env.
