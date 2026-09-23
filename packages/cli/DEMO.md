# Sanctum CLI — Demo

A complete walkthrough of the developer workflow: from a bare machine to an app
running with injected secrets. No `.env` files involved.

## 0. Prerequisites

```bash
npm install -g @sanctum/cli
sanctum --help
```

## 1. Log in (once per machine)

Machine identity (recommended for CI and dev machines):

```bash
sanctum login \
  --client-id d8421d28-3f27-4f44-944d-476ba61063da \
  --client-secret <your-secret> \
  --base-url https://sanctum.example.com
```

```
Logged in with Universal Auth (https://sanctum.example.com) as profile "default".
```

Or a user token:

```bash
sanctum login --token <token> --base-url https://sanctum.example.com
```

Credentials land in `~/.sanctum/credentials.json` (mode 600). Nothing is
written to your project yet.

Need a second identity on the same machine? Add a named profile:

```bash
sanctum login --client-id <ci-bot-id> --client-secret <ci-bot-secret> --profile ci-bot
sanctum profiles
```

```
* default              https://sanctum.example.com
  ci-bot               https://sanctum.example.com
```

## 2. Discover what you can access

```bash
sanctum projects list
```

```
rim-api-mf6-x                    RimAPI  ef120ef1-8ae8-4c6b-8547-eb010073fb4f
```

## 3. Link a folder to a project (once per repo/app)

```bash
cd ~/work/rim-api
sanctum init --project rim-api-mf6-x --env dev --path /
```

```
Wrote /home/you/work/rim-api/sanctum-config.json
  project:     rim-api-mf6-x
  environment: dev
  secretPath:  /
```

`sanctum-config.json`:

```json
{
  "projectSlug": "rim-api-mf6-x",
  "environment": "dev",
  "secretPath": "/"
}
```

**Commit this file.** It contains no secrets — just routing. Every developer
or CI agent that clones the repo gets the same wiring and supplies their own
credentials.

## 4. Day-to-day usage

```bash
sanctum envs                      # dev, staging, prod
sanctum secrets list              # keys only, never values
sanctum secrets set DB_URL=postgres://localhost:5432/app
sanctum secrets get DB_URL        # prints the value
sanctum secrets rm DB_URL
```

### Run your app with secrets injected

```bash
sanctum run -- npm run dev
sanctum run -- node server.js
sanctum run --env staging -- ./deploy.sh
```

Your app reads `process.env.DB_URL` like normal. Secrets exist only in the
child process environment — nothing touches disk.

### Export when you actually need a file

```bash
sanctum export                     # dotenv to stdout
sanctum export --format json
sanctum export --out .env.local    # opt-in, not the default flow
```

### Push an existing .env up

```bash
sanctum push .env
```

```
Pushed 14 secrets to /
```

## 5. Monorepo layout

```
my-mono/
├── sanctum-config.json        # { projectSlug: "my-mono", secretPath: "/shared" }
├── apps/
│   ├── api/
│   │   └── sanctum-config.json    # { secretPath: "/apps/api", imports: [] }
│   └── web/
│       └── sanctum-config.json    # { secretPath: "/apps/web" }
└── .env.example
```

Commands walk up from `cwd` and merge root → leaf. Inside `apps/api`, the CLI
fetches `/shared` first, then `/apps/api` — the deeper path wins on key
conflicts. Project/env inherit from the nearest config.

## 6. CI / machines

No credentials file needed — use env vars:

```bash
export SANCTUM_CLIENT_ID=...
export SANCTUM_CLIENT_SECRET=...
export SANCTUM_BASE_URL=https://sanctum.example.com
# or a raw token: export SANCTUM_TOKEN=...

sanctum run -- npm start
```

Or target a stored profile:

```bash
sanctum secrets list --profile ci-bot
```

Profile resolution order: `--profile` flag > `SANCTUM_PROFILE` env >
`"profile"` in `sanctum-config.json` > `"default"`.

## 7. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `error: Not logged in...` | `sanctum login` or set `SANCTUM_TOKEN` / `SANCTUM_CLIENT_*` |
| `Folder with path '/x' was not found` | Create the folder in the UI, or `--path /` |
| Wrong project | `cd` into the folder with the right `sanctum-config.json` |
| Check who you're acting as | `sanctum whoami` |
