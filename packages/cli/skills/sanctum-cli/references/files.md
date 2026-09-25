# File secrets (binary)

For keystore files, certs, provisioning profiles, `google-services.json`, and
other binary secrets.

## Commands

| Command | Behavior |
| --- | --- |
| `sanctum files push <file>` | uploads raw bytes to the file store (`/api/v3/files`, encrypted at rest, 32 MB cap) under the file's basename, with `localPath` (repo-relative path at push time) and `sha256` |
| `sanctum files pull` | restores each file to its recorded `localPath` relative to cwd |
| `sanctum files list` | lists file secrets at the merged paths |
| `sanctum files diff` | compares local file sha256 vs stored — no content download |

## Restore rules

- `files pull` skips files whose local sha256 already matches; refuses to
  overwrite locally-modified files unless `--force`.
- `--to <dir>` redirects output to a directory (writes basename only).
- A stored `localPath` escaping the project (`../`, absolute) is refused; use
  `--to` to extract those files safely.

## KV fallback

On backends without the file API, push stores a base64 KV secret under
`FILE__<NAME>` with `kind=file`, `localPath`, `sha256` metadata (~700 KB cap).
KV file secrets are excluded from `pull`, `export`, `diff`, `run`, and
`secrets list` by default; pass `--include-files` to include them.

## Escape hatch

`secrets set <KEY> --file <path>` / `secrets get <KEY> --file <out>` write raw
base64 into a plain secret — no metadata, not excluded from env ops.
