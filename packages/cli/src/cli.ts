#!/usr/bin/env node
import { execFile, execSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { basename, dirname, join, relative, resolve } from "node:path";

import { isFilesApiUnavailable, SanctumApiError, SanctumSdk } from "sanctum-sdk";

import {
  getProjectProfile,
  listProfiles,
  loadCredentials,
  setProjectProfile,
  registerChildConfig,
  resolveConfig,
  saveCredentials,
  writeProjectConfig,
  type ResolvedConfig
} from "./config.js";
import { input, password, select } from "./prompt.js";

const require = createRequire(import.meta.url);
const VERSION = (require("../package.json") as { version: string }).version;

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
// cp1252 consoles mangle ✓/✗/—; on Windows only emit them when the console codepage is UTF-8
const useUnicode =
  process.platform !== "win32" ||
  Boolean(process.env.SANCTUM_UNICODE) ||
  (() => {
    try {
      return /65001/.test(execSync("chcp", { encoding: "utf8" }));
    } catch {
      return false;
    }
  })();
const SYM = { ok: useUnicode ? "✓" : "[ok]", err: useUnicode ? "✗" : "[x]", dash: useUnicode ? "—" : "-", dot: useUnicode ? "●" : "*" };
const c = (code: string, s: string | number) => (useColor ? `[${code}m${s}[0m` : String(s));
const bold = (s: string | number) => c("1", s);
const dim = (s: string | number) => c("2", s);
const green = (s: string | number) => c("32", s);
const yellow = (s: string | number) => c("33", s);
const red = (s: string | number) => c("31", s);
const cyan = (s: string | number) => c("36", s);

const die = (message: string, code = 1): never => {
  console.error(`${red(SYM.err)} ${message}`);
  // process.exit while a fetch socket is closing aborts on Windows (UV_HANDLE_CLOSING).
  // Set exitCode and let handles drain; the timer force-exits if a socket lingers.
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1500).unref();
  throw new Error("__cli_exit");
};

const ok = (message: string) => console.log(`${green(SYM.ok)} ${message}`);

/** Decode a JWT payload without verification - display only. */
const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const part = token.split(".")[1];
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const takeFlag = (args: string[], name: string): string | undefined => {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  args.splice(idx, 2);
  return value;
};

const hasFlag = (args: string[], name: string): boolean => {
  const idx = args.indexOf(name);
  if (idx === -1) return false;
  args.splice(idx, 1);
  return true;
};

const getClientIfAvailable = async (profile?: string): Promise<SanctumSdk | null> => {
  const credentials = loadCredentials(profile);
  if (!credentials) return null;

  const sdk = new SanctumSdk({
    baseUrl: credentials.baseUrl,
    accessToken: credentials.accessToken,
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret
  });

  if (!sdk.accessToken) {
    await sdk.authenticate();
  }
  return sdk;
};

const getClient = async (profile?: string): Promise<SanctumSdk> => {
  const sdk = await getClientIfAvailable(profile);
  if (!sdk) {
    return die("Not logged in. Run `sanctum login`, or set SANCTUM_TOKEN / SANCTUM_CLIENT_ID + SANCTUM_CLIENT_SECRET.");
  }
  return sdk;
};

const scopeQuery = (config: ResolvedConfig, secretPath: string, env?: string) => ({
  workspaceId: config.projectId,
  workspaceSlug: config.projectSlug,
  projectSlug: config.projectSlug,
  environment: env ?? config.environment ?? "dev",
  secretPath
});

/** --path override: repoint reads and writes at a single path, ignoring merged imports/ancestors. */
const withPath = (config: ResolvedConfig, path?: string): ResolvedConfig =>
  path ? { ...config, secretPath: path, paths: [path] } : config;

const FILE_PREFIX = "FILE__";
type SecretObj = Awaited<ReturnType<SanctumSdk["secrets"]["list"]>>["secrets"][number];

const metaGet = (s: SecretObj, key: string) => s.secretMetadata?.find((m) => m.key === key)?.value;
const isFileSecret = (s: SecretObj) =>
  metaGet(s, "kind") === "file" || s.secretKey.startsWith(FILE_PREFIX);
const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");
const fileKey = (file: string) =>
  FILE_PREFIX + basename(file).toUpperCase().replace(/[^A-Z0-9_]/g, "_");

/** Fetch secrets across all resolved paths; last path wins on conflicts. */
const fetchMergedSecretObjects = async (
  sdk: SanctumSdk,
  config: ResolvedConfig,
  env?: string,
  origins?: Map<string, string>
): Promise<Map<string, SecretObj>> => {
  const merged = new Map<string, SecretObj>();
  for (const path of config.paths) {
    const { secrets, imports } = await sdk.secrets.list({
      ...scopeQuery(config, path, env),
      viewSecretValue: true,
      expandSecretReferences: true,
      include_imports: true
    });
    for (const imp of imports ?? []) {
      for (const s of imp.secrets) {
        merged.set(s.secretKey, s);
        origins?.set(s.secretKey, `${path} (import)`);
      }
    }
    for (const s of secrets) {
      merged.set(s.secretKey, s);
      origins?.set(s.secretKey, path);
    }
  }
  return merged;
};

const fetchMergedSecrets = async (
  sdk: SanctumSdk,
  config: ResolvedConfig,
  env?: string,
  origins?: Map<string, string>,
  includeFiles = false
): Promise<Record<string, string>> => {
  const objs = await fetchMergedSecretObjects(sdk, config, env, origins);
  const merged: Record<string, string> = {};
  for (const [key, s] of objs) {
    if (!includeFiles && isFileSecret(s)) continue;
    merged[key] = s.secretValue ?? "";
  }
  return merged;
};

/** Create the configured secretPath remotely if missing. Best-effort: the real write surfaces any actual error. */
const ensureRemotePath = async (sdk: SanctumSdk, config: ResolvedConfig, env?: string) => {
  const secretPath = config.secretPath ?? "/";
  if (secretPath === "/") return;
  try {
    await sdk.folders.ensurePath({
      projectId: config.projectId,
      projectSlug: config.projectSlug,
      environment: env ?? config.environment ?? "dev",
      path: secretPath
    });
  } catch { /* folder creation needs write permission; the write itself reports real errors */ }
};

const openBrowser = (url: string) => {
  const [cmd, cmdArgs] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  execFile(cmd, cmdArgs, () => {});
};

/** Browser login: listen on 127.0.0.1, web UI POSTs {JTWToken} back via ?callback_port. */
const browserLogin = (baseUrl: string) =>
  new Promise<{ JTWToken?: string; email?: string }>((resolve, reject) => {
    const server = createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        return void res.end();
      }
      if (req.method !== "POST") {
        res.writeHead(404);
        return void res.end();
      }
      let body = "";
      req.on("data", (c: Buffer) => (body += c));
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
        clearTimeout(timeout);
        server.close();
        try {
          resolve(JSON.parse(body) as { JTWToken?: string; email?: string });
        } catch {
          reject(new Error("Bad login payload"));
        }
      });
    });
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Browser login timed out"));
    }, 180_000);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      const url = `${baseUrl}/login?callback_port=${port}`;
      console.log(`Opening ${url}\nComplete login in the browser...`);
      openBrowser(url);
    });
  });

// ---------- commands ----------

const cmdLogin = async (args: string[]) => {
  let baseUrl = takeFlag(args, "--base-url");
  let token = takeFlag(args, "--token");
  let clientId = takeFlag(args, "--client-id");
  let clientSecret = takeFlag(args, "--client-secret");
  let profile = takeFlag(args, "--profile");
  const browser = hasFlag(args, "--browser");

  if (!token && !(clientId && clientSecret)) {
    if (!process.stdin.isTTY) {
      die("Provide --token, --client-id + --client-secret, or --browser.");
    }

    const step = (n: number, total: number, label: string) =>
      console.log(`\n[${n}/${total}] ${label}`);

    step(1, 4, "Sanctum instance");
    baseUrl = baseUrl ?? (await input("URL", "http://localhost:4000"));

    step(2, 4, "Login method");
    const method = browser
      ? "browser"
      : await select("How do you want to log in?", [
          { label: "Browser", value: "browser", hint: "opens the web UI, token comes back automatically" },
          { label: "Machine identity", value: "ua", hint: "clientId + clientSecret, recommended for dev/CI" },
          { label: "Access token", value: "token", hint: "paste a user or identity token" }
        ]);

    step(3, 4, "Credentials");
    if (method === "browser") {
      const { JTWToken, email } = await browserLogin(baseUrl);
      if (!JTWToken) die("Browser login did not return a token.");
      token = JTWToken;
      if (email) console.log(`Authenticated as ${email}.`);
    } else if (method === "ua") {
      clientId = await input("Client ID");
      clientSecret = await password("Client secret");
    } else {
      token = await password("Access token");
    }
    if (!token && !(clientId && clientSecret)) die("Login aborted.");

    step(4, 4, "Profile name");
    profile = profile ?? (await input("Profile", "default"));
  }
  baseUrl = baseUrl ?? "http://localhost:4000";
  profile = profile ?? "default";

  const credentials = { baseUrl, accessToken: token, clientId, clientSecret };

  if (clientId && clientSecret) {
    const sdk = new SanctumSdk({ baseUrl, clientId, clientSecret });
    const tokens = await sdk.authenticate();
    saveCredentials({ ...credentials, accessToken: tokens.accessToken }, profile);
    console.log(`Logged in with Universal Auth (${baseUrl}) as profile "${profile}".`);
  } else {
    saveCredentials(credentials, profile);
    console.log(`Token saved (${baseUrl}) as profile "${profile}".`);
  }
};

/** Normalize a name for fuzzy matching: lowercase, strip non-alphanumerics. */
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Best-effort local project name: package.json "name" > git remote repo name > directory name. */
const detectLocalName = (): string | null => {
  try {
    const pkg = join(process.cwd(), "package.json");
    if (existsSync(pkg)) {
      const name = (JSON.parse(readFileSync(pkg, "utf8")) as { name?: string }).name;
      if (name) return name.replace(/^@[^/]+\//, "");
    }
  } catch { /* fall through */ }
  try {
    const gitConfig = join(process.cwd(), ".git", "config");
    if (existsSync(gitConfig)) {
      const m = readFileSync(gitConfig, "utf8").match(/url\s*=\s*.+\/([^/\s]+?)(?:\.git)?\s*$/m);
      if (m?.[1]) return m[1];
    }
  } catch { /* fall through */ }
  return basename(process.cwd());
};

const cmdInit = async (args: string[]) => {
  let project = takeFlag(args, "--project");
  let environment = takeFlag(args, "--env");
  let secretPath = takeFlag(args, "--path");
  const profile = takeFlag(args, "--profile");
  const imports = (takeFlag(args, "--imports") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const all = hasFlag(args, "--all");
  const force = hasFlag(args, "--force");

  const configFile = join(process.cwd(), "sanctum-config.json");
  if (existsSync(configFile) && !force) {
    const existing = JSON.parse(readFileSync(configFile, "utf8")) as Record<string, unknown>;
    console.log(`${yellow("!")} existing config: ${existing.projectSlug ?? existing.projectId} @ ${existing.environment ?? "dev"} ${existing.secretPath ?? "/"}`);
    if (!process.stdin.isTTY) {
      die("sanctum-config.json already exists. Re-run with --force to overwrite.");
    }
    const overwrite = await select("Overwrite it?", [
      { label: "Yes", value: true },
      { label: "No", value: false }
    ]);
    if (!overwrite) {
      console.log("Keeping existing config.");
      return;
    }
  }

  // monorepo batch link: root config + one child config per subdir that has package.json or .env
  if (all) {
    if (!project) return die("Usage: sanctum init --all --project <id-or-slug> [--env dev] [--profile name]");
    environment = environment ?? "dev";
    const projectKey = project.includes("-") && project.length > 20 ? { projectId: project } : { projectSlug: project };
    const cwd = process.cwd();
    const children = readdirSync(cwd, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules")
      .map((d) => d.name)
      .filter((name) => existsSync(join(cwd, name, "package.json")) || existsSync(join(cwd, name, ".env")));

    console.log(`Wrote ${writeProjectConfig(cwd, { ...projectKey, environment, secretPath: "/", imports: [] })} (root, path /)`);

    const sdk = await getClientIfAvailable(profile);
    for (const name of children) {
      const childDir = join(cwd, name);
      writeProjectConfig(childDir, { ...projectKey, environment, secretPath: `/${name}`, imports: [] });
      registerChildConfig(childDir);
      if (sdk) {
        try {
          await sdk.folders.ensurePath({ ...projectKey, environment, path: `/${name}` });
        } catch { /* best-effort provisioning */ }
      }
      console.log(`  linked ${name} -> /${name}`);
    }
    if (!children.length) console.log("No child dirs containing package.json or .env found.");
    return;
  }

  // non-interactive path: --project is enough to write the config
  if (project && !environment) environment = "dev";
  if (project && !secretPath) secretPath = "/";

  const interactive = process.stdin.isTTY && (!project || !environment || !secretPath);
  if (interactive) {
    const sdk = await getClient(profile);

    if (!project) {
      const { projects } = await sdk.projects.list();

      const mode = await select("Project", [
        { label: "Link to an existing project", value: "link" },
        { label: "Create a new project", value: "new" }
      ]);

      if (mode === "new") {
        const name = await input("New project name", detectLocalName() ?? undefined);
        const { project: created } = await sdk.projects.create({ projectName: name });
        console.log(`Created project '${created.name}' (${created.slug})`);
        project = created.slug;
      } else {
        if (!projects.length) return die("No projects accessible with this credential.");
        const localName = normalize(detectLocalName() ?? "");
        const choices = projects.map((p) => ({
          label: `${p.name}  (${p.slug})`,
          value: p.slug,
          hint: localName && (normalize(p.slug).includes(localName) || normalize(p.name).includes(localName) || localName.includes(normalize(p.slug)))
            ? "detected"
            : undefined
        }));
        choices.sort((a, b) => Number(Boolean(b.hint)) - Number(Boolean(a.hint)));

        project = await select("Select a project", choices);
      }
    }

    if (!environment) {
      const projectId = project.includes("-") && project.length > 20
        ? project
        : (await sdk.projects.getBySlug(project)).id;
      const { environments } = await sdk.projects.listEnvironments(projectId);
      environment = environments.length
        ? await select("Environment", environments.map((e) => ({ label: `${e.name}  (${e.slug})`, value: e.slug })))
        : await input("Environment", "dev");
    }

    if (!secretPath) secretPath = await input("Secret path", "/");

    if (secretPath !== "/") {
      const scope = project.includes("-") && project.length > 20 ? { projectId: project } : { projectSlug: project };
      try {
        await sdk.folders.ensurePath({ ...scope, environment, path: secretPath });
        console.log(`Ensured remote path ${environment}:${secretPath}`);
      } catch { /* remote folder creation is best-effort at init time */ }
    }
  }

  if (!project || !environment || !secretPath) {
    return die("Usage: sanctum init --project <id-or-slug> [--env dev] [--path /apps/api] [--imports /shared] [--profile name]");
  }

  // non-interactive path: provision the remote folder if credentials are available (CI/agents)
  if (!interactive && secretPath !== "/") {
    try {
      const sdk = await getClientIfAvailable(profile);
      if (!sdk) throw new Error("no credentials");
      const scope = project.includes("-") && project.length > 20 ? { projectId: project } : { projectSlug: project };
      await sdk.folders.ensurePath({ ...scope, environment, path: secretPath });
      console.log(`Ensured remote path ${environment}:${secretPath}`);
    } catch { /* no credentials or no permission — init still writes config */ }
  }

  const config = {
    [project.includes("-") && project.length > 20 ? "projectId" : "projectSlug"]: project,
    environment,
    secretPath,
    imports
  };

  // profile binding is personal: stored in ~/.sanctum/credentials.json, never the shared config
  if (profile) {
    setProjectProfile(project, profile);
  }

  const file = writeProjectConfig(process.cwd(), config);
  const rootFile = registerChildConfig(process.cwd());
  console.log(`Wrote ${file}`);
  if (rootFile) console.log(`Registered in ${rootFile}`);
  console.log(`  project:     ${project}`);
  console.log(`  environment: ${environment}`);
  console.log(`  secretPath:  ${secretPath} (vault-side folder, not a filesystem path)${imports.length ? ` (+ imports: ${imports.join(", ")})` : ""}${profile ? `, profile: ${profile} (local only)` : ""}`);
};

const cmdStatus = async () => {
  const config = resolveConfig();
  console.log(`${cyan(SYM.dot)} ${bold(config.projectSlug ?? config.projectId ?? "?")} ${dim(`@ ${config.environment ?? "dev"}`)}\n`);
  console.log(`  ${dim("config")}    ${config.configFile}`);
  console.log(`  ${dim("paths")}     ${config.paths.join(", ")}`);
  if (getProjectProfile(config.projectSlug)) console.log(`  ${dim("profile")}   ${getProjectProfile(config.projectSlug)}`);
  if (config.projects) {
    console.log(`\n  ${dim("linked projects")}`);
    for (const [dir, entry] of Object.entries(config.projects)) {
      const detail = typeof entry === "string" ? entry : `${entry.projectSlug ?? ""} ${entry.secretPath ?? ""}`.trim();
      console.log(`    ${dir.padEnd(24)} ${dim(detail)}`);
    }
  }

  // drift: compare local .env against remote when both exist (best-effort)
  if (existsSync(".env")) {
    try {
      const sdk = await getClientIfAvailable(getProjectProfile(config.projectSlug));
      if (sdk) {
        const local = sdk.dotenv.parseDotenv(readFileSync(".env", "utf8"));
        const remote = await fetchMergedSecrets(sdk, config);
        const differ = Object.keys(local).filter((k) => k in remote && remote[k] !== local[k]).length;
        const newLocal = Object.keys(local).filter((k) => !(k in remote)).length;
        const remoteOnly = Object.keys(remote).filter((k) => !(k in local)).length;
        if (differ || newLocal || remoteOnly) {
          console.log(`\n  ${dim("drift")}     ${newLocal} local-only, ${differ} differ, ${remoteOnly} remote-only (sanctum diff)`);
        } else {
          console.log(`\n  ${dim("drift")}     .env in sync`);
        }
      }
    } catch { /* drift is informational only */ }
  }
};

const cmdProfiles = async (args: string[]) => {
  const profiles = listProfiles();
  if (!profiles.length) die("No profiles. Run `sanctum login` first.");

  if (args[0] === "use") {
    const config = resolveConfig();
    const slug = config.projectSlug ?? config.projectId;
    if (!slug) die("No project slug in sanctum-config.json.");
    const current = getProjectProfile(config.projectSlug) ?? process.env.SANCTUM_PROFILE ?? "default";
    const name = await select(`Profile for project '${slug}'`, profiles.map((p) => ({
      label: `${p.name}  ${p.baseUrl}`,
      value: p.name,
      hint: p.name === current ? "current" : undefined
    })));
    setProjectProfile(config.projectSlug!, name);
    ok(`${slug} -> profile '${name}' (stored locally, not in sanctum-config.json)`);
    return;
  }

  for (const p of profiles) {
    console.log(`${p.isDefault ? "*" : " "} ${p.name.padEnd(20)} ${p.baseUrl}`);
  }
};

const cmdProjects = async (args: string[]) => {
  const sub = args[0] ?? "list";
  const profile = takeFlag(args, "--profile");
  const sdk = await getClient(profile);
  if (sub === "list") {
    const { projects } = await sdk.projects.list();
    for (const p of projects) console.log(`${p.slug.padEnd(32)} ${p.name}  ${p.id}`);
  } else {
    die(`Unknown subcommand: projects ${sub}`);
  }
};

const cmdEnvs = async (args: string[]) => {
  const config = resolveConfig();
  const profile = takeFlag(args, "--profile") ?? getProjectProfile(config.projectSlug);
  const sdk = await getClient(profile);
  const projectId = config.projectId ?? (await sdk.projects.getBySlug(config.projectSlug!)).id;
  const { environments } = await sdk.projects.listEnvironments(projectId);
  for (const e of environments) console.log(`${e.slug.padEnd(16)} ${e.name}`);
};

/** Create a secret, falling back to update only when the server says it already exists. */
const upsertSecret = async (
  sdk: SanctumSdk,
  key: string,
  secretValue: string,
  scope: Record<string, unknown>,
  secretMetadata?: { key: string; value: string }[]
): Promise<{ verb: "Created" | "Updated"; approval?: { id: string; slug?: string } }> => {
  const extra = secretMetadata ? { secretMetadata } : {};
  try {
    const r = await sdk.secrets.create(key, { ...scope, secretValue, ...extra } as never);
    return { verb: "Created", approval: r.approval };
  } catch (err) {
    const conflict = err instanceof SanctumApiError && /exist|conflict/i.test(err.message);
    if (!conflict) throw err;
    const r = await sdk.secrets.update(key, { ...scope, secretValue, ...extra } as never);
    return { verb: "Updated", approval: r.approval };
  }
};

const cmdSecrets = async (args: string[]) => {
  const sub = args.shift();
  const env = takeFlag(args, "--env");
  const path = takeFlag(args, "--path");
  const config = resolveConfig();
  const profile = takeFlag(args, "--profile") ?? getProjectProfile(config.projectSlug);
  const sdk = await getClient(profile);
  const scope = (p?: string) => scopeQuery(config, p ?? path ?? config.secretPath ?? "/", env);

  switch (sub) {
    case "list": {
      const exact = hasFlag(args, "--exact");
      const includeFiles = hasFlag(args, "--include-files");
      const cfg = exact ? withPath(config, path ?? config.secretPath ?? "/") : config;
      const origins = new Map<string, string>();
      const objs = await fetchMergedSecretObjects(sdk, cfg, env, origins);
      const all = [...objs.values()];
      const files = all.filter(isFileSecret);
      const shown = includeFiles ? all : all.filter((s) => !isFileSecret(s));
      const keys = shown.map((s) => s.secretKey).sort();
      const annotate = cfg.paths.length > 1;
      for (const k of keys) console.log(annotate ? `${k}  ${dim(origins.get(k) ?? "")}` : k);
      const scopeLabel = `${env ?? cfg.environment ?? "dev"} @ ${cfg.paths.join(", ")}`;
      console.log(dim(`\n${keys.length} secrets (${scopeLabel})`));
      if (files.length && !includeFiles)
        console.log(dim(`+ ${files.length} file secret(s) hidden - \`sanctum files list\` / --include-files`));
      if (!keys.length) console.log(dim(`empty or missing path. Check with \`sanctum folders list\` or create with \`sanctum folders create <path>\`.`));
      break;
    }
    case "get": {
      const key = args[0];
      if (!key) die("Usage: sanctum secrets get <KEY>");
      const { secret } = await sdk.secrets.get(key, scope());
      const outFile = takeFlag(args, "--file");
      if (outFile) {
        writeFileSync(outFile, Buffer.from(secret.secretValue ?? "", "base64"));
        ok(`Decoded ${key} to ${outFile}`);
      } else {
        console.log(secret.secretValue ?? "");
      }
      break;
    }
    case "set": {
      const file = takeFlag(args, "--file");
      const pair = args[0];
      let key: string;
      let value: string;
      if (file) {
        if (!pair || pair.includes("=")) die("Usage: sanctum secrets set <KEY> --file <path> (stores base64)");
        if (!existsSync(file)) die(`${file} not found`);
        key = pair;
        value = readFileSync(file).toString("base64");
      } else {
        if (!pair?.includes("=")) die("Usage: sanctum secrets set <KEY>=<value> | <KEY> --file <path>");
        [key] = pair.split("=");
        value = pair.slice(key.length + 1);
      }
      await ensureRemotePath(sdk, config, env);
      const result = await upsertSecret(sdk, key, value, scope());
      if (result.approval) console.log(`${yellow("?")} ${key} queued for approval${result.approval.slug ? ` (${result.approval.slug})` : ""}`);
      else ok(`${result.verb} ${key}${file ? dim(` (base64, ${file})`) : ""}`);
      break;
    }
    case "rm":
    case "delete": {
      const key = args[0];
      if (!key) die("Usage: sanctum secrets rm <KEY>");
      const yes = hasFlag(args, "--yes") || hasFlag(args, "-y");
      if (!yes && process.stdin.isTTY) {
        const proceed = await select(`Delete ${key} from ${path ?? config.secretPath ?? "/"} (${env ?? config.environment ?? "dev"})?`, [
          { label: "Yes", value: true },
          { label: "No", value: false }
        ]);
        if (!proceed) {
          console.log("Skipped.");
          break;
        }
      }
      const result = await sdk.secrets.delete(key, scope());
      if (result.approval) console.log(`${yellow("?")} deletion of ${key} queued for approval${result.approval.slug ? ` (${result.approval.slug})` : ""}`);
      else ok(`Deleted ${key}`);
      break;
    }
    default:
      die("Usage: sanctum secrets <list|get|set|rm>");
  }
};

const cmdFolders = async (args: string[]) => {
  const sub = args.shift();
  const env = takeFlag(args, "--env");
  const pathFlag = takeFlag(args, "--path");
  const allEnvs = hasFlag(args, "--all-envs");
  const config = resolveConfig();
  const profile = takeFlag(args, "--profile") ?? getProjectProfile(config.projectSlug);
  const sdk = await getClient(profile);
  const scope = { projectId: config.projectId, projectSlug: config.projectSlug };

  switch (sub) {
    case "create": {
      const target = args[0] ?? pathFlag;
      if (!target) return die("Usage: sanctum folders create <path> [--env x] [--all-envs]");
      const envs = allEnvs
        ? (await sdk.projects.listEnvironments(
            config.projectId ?? (await sdk.projects.getBySlug(config.projectSlug!)).id
          )).environments.map((e) => e.slug)
        : [env ?? config.environment ?? "dev"];
      for (const e of envs) {
        await sdk.folders.ensurePath({ ...scope, environment: e, path: target });
        ok(`${e}: ${target}`);
      }
      break;
    }
    case "list": {
      const { folders } = await sdk.folders.list({
        ...scope,
        environment: env ?? config.environment ?? "dev",
        path: pathFlag ?? "/"
      });
      for (const f of folders) console.log(f.relativePath ?? f.name);
      break;
    }
    default:
      die("Usage: sanctum folders <create <path>|list> [--env x] [--all-envs] [--path /x]");
  }
};

const cmdFiles = async (args: string[]) => {
  const sub = args.shift();
  const env = takeFlag(args, "--env");
  const path = takeFlag(args, "--path");
  const config = withPath(resolveConfig(), path);
  const profile = takeFlag(args, "--profile") ?? getProjectProfile(config.projectSlug);
  const sdk = await getClient(profile);
  const envName = env ?? config.environment ?? "dev";
  const projectScope = { projectId: config.projectId, projectSlug: config.projectSlug };

  // Blob API first; FILE__ KV secrets remain for instances that predate /api/v3/files
  const listBlobFiles = async (): Promise<{ name: string; localPath?: string | null; sha256?: string; id?: string; path?: string; legacy?: boolean }[]> => {
    const out: { name: string; localPath?: string | null; sha256?: string; id?: string; path?: string; legacy?: boolean }[] = [];
    for (const p of config.paths) {
      try {
        const { files } = await sdk.files.list({ ...projectScope, environment: envName, path: p });
        for (const f of files) out.push({ name: f.name, localPath: f.localPath, sha256: f.sha256, id: f.id, path: p });
      } catch (err) {
        if (!isFilesApiUnavailable(err)) throw err;
      }
    }
    return out;
  };

  const listLegacy = async () =>
    [...(await fetchMergedSecretObjects(sdk, config, env)).values()].filter(isFileSecret).map((f) => ({
      name: f.secretKey,
      localPath: metaGet(f, "localPath"),
      sha256: metaGet(f, "sha256"),
      legacy: true
    }));

  const listAll = async () => [...(await listBlobFiles()), ...(await listLegacy())];

  switch (sub) {
    case "push": {
      const file = args[0];
      if (!file) die("Usage: sanctum files push <file> [--path /x] [--env x]");
      if (!existsSync(file)) die(`${file} not found`);
      const content = readFileSync(file);
      const MAX_BLOB_BYTES = 32 * 1024 * 1024;
      if (content.length > MAX_BLOB_BYTES) die(`${file} exceeds the 32 MB file limit.`);
      const localPath = relative(process.cwd(), resolve(file)).split("\\").join("/") || basename(file);
      const digest = sha256(content);
      try {
        const { file: f } = await sdk.files.upload({
          ...projectScope,
          environment: envName,
          path: config.secretPath ?? "/",
          name: basename(file),
          localPath,
          sha256: digest,
          content
        });
        ok(`Stored ${f.name}  ${dim(`${localPath}, sha256 ${digest.slice(0, 12)}, v${f.version ?? 1}`)}`);
      } catch (err) {
        if (!isFilesApiUnavailable(err)) throw err;
        // legacy fallback: base64 KV secret (1 MB body cap -> ~700 KB binary)
        if (content.length > 700 * 1024)
          die(`${file} is too large for this server version (~700 KB KV cap); upgrade the backend for 32 MB blob storage.`);
        const key = fileKey(file);
        await ensureRemotePath(sdk, config, env);
        const result = await upsertSecret(sdk, key, content.toString("base64"), scopeQuery(config, config.secretPath ?? "/", env), [
          { key: "kind", value: "file" },
          { key: "localPath", value: localPath },
          { key: "sha256", value: digest }
        ]);
        if (result.approval) console.log(`${yellow("?")} ${key} queued for approval${result.approval.slug ? ` (${result.approval.slug})` : ""}`);
        else ok(`${result.verb} ${key}  ${dim(`${localPath}, sha256 ${digest.slice(0, 12)}`)}`);
      }
      break;
    }
    case "list": {
      const files = await listAll();
      for (const f of files) {
        const digest = f.sha256?.slice(0, 12);
        console.log(`${f.name.padEnd(40)} ${dim(`${f.localPath ?? "?"}${digest ? `  sha256:${digest}` : ""}${f.legacy ? "  (kv)" : ""}`)}`);
      }
      if (!files.length) console.log(dim(`no file secrets at ${envName} @ ${config.paths.join(", ")} - push one with \`sanctum files push <file>\``));
      break;
    }
    case "pull": {
      const to = takeFlag(args, "--to");
      const force = hasFlag(args, "--force");
      const blobs = await listBlobFiles();
      const legacy = await listLegacy();
      if (!blobs.length && !legacy.length) {
        console.log("No file secrets.");
        break;
      }
      let wrote = 0;
      let skipped = 0;
      const safeLocalPath = (lp: string) =>
        !/^[A-Za-z]:|^[/\\]/.test(lp) && !lp.split(/[/\\]/).includes("..") && resolve(process.cwd(), lp).startsWith(process.cwd());
      const writeDest = (lp: string, storedSha: string | undefined, bytes: Buffer | undefined) => {
        if (!to && !safeLocalPath(lp)) {
          console.log(`${yellow("!")} ${lp} - unsafe restore path, use --to <dir> to extract`);
          skipped += 1;
          return;
        }
        const dest = to ? join(to, basename(lp)) : resolve(process.cwd(), lp);
        if (existsSync(dest)) {
          const localSha = sha256(readFileSync(dest));
          if (localSha === storedSha) {
            skipped += 1;
            return;
          }
          if (storedSha && !force) {
            console.log(`${yellow("!")} ${lp} - locally modified, skipped (--force to overwrite)`);
            skipped += 1;
            return;
          }
        }
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, bytes ?? "");
        ok(`wrote ${to ? join(to, basename(lp)) : lp}`);
        wrote += 1;
      };
      for (const f of blobs) {
        const lp = f.localPath ?? f.name;
        const dest = to ? join(to, basename(lp)) : resolve(process.cwd(), lp);
        if (existsSync(dest) && f.sha256) {
          const localSha = sha256(readFileSync(dest));
          if (localSha === f.sha256) {
            skipped += 1;
            continue;
          }
          if (!force) {
            console.log(`${yellow("!")} ${lp} - locally modified, skipped (--force to overwrite)`);
            skipped += 1;
            continue;
          }
        }
        if (!f.id) continue;
        const { content } = await sdk.files.download(projectScope, f.id);
        writeDest(lp, f.sha256, Buffer.from(content));
      }
      for (const f of legacy) {
        const lp = f.localPath ?? f.name.slice(FILE_PREFIX.length).toLowerCase();
        const secret = (await fetchMergedSecretObjects(sdk, config, env)).get(f.name);
        writeDest(lp, f.sha256, secret ? Buffer.from(secret.secretValue ?? "", "base64") : undefined);
      }
      console.log(dim(`${wrote} written, ${skipped} skipped`));
      break;
    }
    case "diff": {
      const files = await listAll();
      for (const f of files) {
        const lp = f.localPath ?? f.name;
        if (!existsSync(lp)) console.log(`${yellow("+")} ${lp}  ${dim("missing locally")}`);
        else if (f.sha256 && sha256(readFileSync(lp)) !== f.sha256) console.log(`${yellow("~")} ${lp}  ${dim("modified locally")}`);
        else console.log(`${dim("=")} ${lp}`);
      }
      if (!files.length) console.log("No file secrets.");
      break;
    }
    default:
      die("Usage: sanctum files <push <file>|pull [--to dir] [--force]|list|diff> [--env x] [--path /x]");
  }
};

const maskValue = (v: string): string => (v.length <= 4 ? "****" : `${v.slice(0, 2)}***${v.slice(-2)}`);

const diffOne = async (
  sdk: SanctumSdk,
  config: ResolvedConfig,
  file: string,
  env: string | undefined,
  showValues: boolean,
  includeFiles = false
) => {
  const local = existsSync(file) ? sdk.dotenv.parseDotenv(readFileSync(file, "utf8")) : {};
  const remote = await fetchMergedSecrets(sdk, config, env, undefined, includeFiles);

  const localKeys = new Set(Object.keys(local));
  const remoteKeys = new Set(Object.keys(remote));
  const allKeys = [...new Set([...localKeys, ...remoteKeys])].sort();

  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];
  let unchanged = 0;

  for (const key of allKeys) {
    if (localKeys.has(key) && !remoteKeys.has(key)) added.push(key);
    else if (!localKeys.has(key) && remoteKeys.has(key)) removed.push(key);
    else if (local[key] !== remote[key]) changed.push(key);
    else unchanged += 1;
  }

  const renderValue = (v: string) => (showValues ? v : maskValue(v));
  for (const k of added) console.log(`${green("+")} ${k}  ${dim("local only")}${showValues ? `: ${local[k]}` : ""}`);
  for (const k of changed) {
    console.log(`${yellow("~")} ${k}  local=${renderValue(local[k])}  remote=${renderValue(remote[k])}`);
  }
  for (const k of removed) console.log(`${red("-")} ${k}  ${dim("remote only")}`);

  console.log(
    `\n${added.length} to add, ${changed.length} to update, ${removed.length} remote-only, ${unchanged} unchanged` +
      (existsSync(file) ? `  [${file} vs ${config.projectSlug ?? config.projectId}/${config.environment ?? "dev"}]` : `  [no ${file} - showing remote-only]`)
  );
};

const cmdDiff = async (args: string[]) => {
  const env = takeFlag(args, "--env");
  const path = takeFlag(args, "--path");
  const showValues = hasFlag(args, "--values");
  const includeFiles = hasFlag(args, "--include-files");
  const all = hasFlag(args, "--all");
  const config = resolveConfig();
  const profile = takeFlag(args, "--profile") ?? getProjectProfile(config.projectSlug);
  const file = args[0] ?? ".env";
  const sdk = await getClient(profile);

  // monorepo: root config registers linked children - offer a scope pick
  if (config.projects && Object.keys(config.projects).length) {
    const rootDir = dirname(config.configFile);
    const entries = Object.keys(config.projects);

    let selected: string[] | null = all ? entries : null;
    if (!selected && process.stdin.isTTY && !args[0]) {
      const choice = await select(
        "Diff which project?",
        [
          { label: "All", value: "__all__" },
          { label: "(this directory)", value: "__here__" },
          ...entries.map((e) => ({ label: e, value: e }))
        ]
      );
      if (choice === "__all__") selected = entries;
      else if (choice === "__here__") selected = [];
      else selected = [choice];
    }
    if (!selected) selected = [];

    for (const rel of selected) {
      console.log(`\n== ${rel} ==`);
      const childDir = join(rootDir, rel);
      const childConfig = resolveConfig(childDir);
      await diffOne(sdk, withPath(childConfig, path), join(childDir, file), env, showValues, includeFiles);
    }
    if (selected.length) return;
  }

  await diffOne(sdk, withPath(config, path), file, env, showValues, includeFiles);
};

const cmdExport = async (args: string[]) => {
  const env = takeFlag(args, "--env");
  const path = takeFlag(args, "--path");
  const format = takeFlag(args, "--format") ?? "dotenv";
  const outFile = takeFlag(args, "--out");
  const includeFiles = hasFlag(args, "--include-files");
  const config = resolveConfig();
  const profile = takeFlag(args, "--profile") ?? getProjectProfile(config.projectSlug);
  const sdk = await getClient(profile);
  const merged = await fetchMergedSecrets(sdk, withPath(config, path), env, undefined, includeFiles);

  let output: string;
  if (format === "json") {
    output = JSON.stringify(merged, null, 2);
  } else {
    output = sdk.dotenv.renderDotenv(merged);
  }

  if (outFile) {
    writeFileSync(outFile, output + "\n");
    console.log(`Wrote ${Object.keys(merged).length} secrets to ${outFile}`);
  } else {
    console.log(output);
  }
};

/** Merge remote secrets into existing dotenv text: update values in place, append new keys, keep everything else. */
const mergeDotenv = (existing: string, remote: Record<string, string>): { text: string; updated: number; added: number } => {
  const applied = new Set<string>();
  let updated = 0;
  const lines = existing.split(/\r?\n/).map((line) => {
    const m = line.match(/^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) return line;
    const key = m[2];
    if (!(key in remote)) return line;
    applied.add(key);
    if (m[3] === remote[key]) return line;
    updated += 1;
    return `${m[1]}${key}=${remote[key]}`;
  });
  const appended = Object.keys(remote).filter((k) => !applied.has(k));
  const out = [...lines];
  if (out.length && out[out.length - 1] === "") out.pop();
  for (const k of appended) out.push(`${k}=${remote[k]}`);
  return { text: out.join("\n"), updated, added: appended.length };
};

const pullOne = async (
  sdk: SanctumSdk,
  config: ResolvedConfig,
  outFile: string,
  env: string | undefined,
  skipConfirm = false,
  includeFiles = false
) => {
  const merged = await fetchMergedSecrets(sdk, config, env, undefined, includeFiles);
  if (existsSync(outFile)) {
    const { text, updated, added } = mergeDotenv(readFileSync(outFile, "utf8"), merged);
    if (!updated && !added) {
      ok(`${outFile} already in sync - no changes.`);
      return;
    }
    if (!skipConfirm && process.stdin.isTTY) {
      const proceed = await select(`${outFile}: update ${updated}, add ${added} - apply?`, [
        { label: "Yes", value: true },
        { label: "No", value: false }
      ]);
      if (!proceed) {
        console.log("Skipped.");
        return;
      }
    }
    writeFileSync(outFile, text.endsWith("\n") ? text : text + "\n");
    ok(`Updated ${updated}, added ${added} in ${outFile}`);
    return;
  }
  writeFileSync(outFile, sdk.dotenv.renderDotenv(merged) + "\n");
  ok(`Pulled ${Object.keys(merged).length} secrets to ${outFile}`);
};

const cmdPull = async (args: string[]) => {
  const env = takeFlag(args, "--env");
  const path = takeFlag(args, "--path");
  const all = hasFlag(args, "--all");
  const yes = hasFlag(args, "--yes") || hasFlag(args, "-y") || hasFlag(args, "--force");
  const includeFiles = hasFlag(args, "--include-files");
  const outFlag = takeFlag(args, "--out");
  const config = resolveConfig();
  const profile = takeFlag(args, "--profile") ?? getProjectProfile(config.projectSlug);
  const file = outFlag ?? args[0] ?? ".env";
  const sdk = await getClient(profile);

  if (config.projects && Object.keys(config.projects).length) {
    const rootDir = dirname(config.configFile);
    const entries = Object.keys(config.projects);

    let selected: string[] | null = all ? entries : null;
    if (!selected && process.stdin.isTTY && !args[0] && !outFlag) {
      const choice = await select(
        "Pull which project?",
        [
          { label: "All", value: "__all__" },
          { label: "(this directory)", value: "__here__" },
          ...entries.map((e) => ({ label: e, value: e }))
        ]
      );
      if (choice === "__all__") selected = entries;
      else if (choice === "__here__") selected = [];
      else selected = [choice];
    }
    if (!selected) selected = [];

    for (const rel of selected) {
      const childDir = join(rootDir, rel);
      console.log(`\n== ${rel} ==`);
      await pullOne(sdk, withPath(resolveConfig(childDir), path), join(childDir, file), env, yes, includeFiles);
    }
    if (selected.length) {
      console.log("note: pulled files contain real secret values - keep them out of git.");
      return;
    }
  }

  await pullOne(sdk, withPath(config, path), file, env, yes, includeFiles);
  console.log("note: pulled files contain real secret values - keep them out of git.");
};

const cmdRun = async (args: string[]) => {
  const separator = args.indexOf("--");
  const head = separator === -1 ? args : args.slice(0, separator);
  const env = takeFlag(head, "--env");
  const profileFlag = takeFlag(head, "--profile");
  const command = separator === -1 ? head : args.slice(separator + 1);
  if (!command.length) die("Usage: sanctum run [--env dev] [--profile x] -- <command> [args...]");

  const config = resolveConfig();
  const profile = profileFlag ?? getProjectProfile(config.projectSlug);
  const sdk = await getClient(profile);
  const merged = await fetchMergedSecrets(sdk, config, env);
  if (!Object.keys(merged).length) {
    console.error(
      `warning: no secrets resolved for ${config.projectSlug ?? config.projectId}/${config.environment ?? "dev"} ` +
        `(paths: ${config.paths.join(", ")}) - check the environment and paths exist.`
    );
  }

  const child = spawn(command[0], command.slice(1), {
    env: { ...process.env, ...merged },
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  child.on("exit", (code) => process.exit(code ?? 0));
};

const cmdEnvFile = async (args: string[]) => {
  const dryRun = hasFlag(args, "--dry-run");
  const assumeYes = hasFlag(args, "--yes") || hasFlag(args, "-y");
  const env = takeFlag(args, "--env");
  const path = takeFlag(args, "--path");
  const file = args[0] ?? ".env";
  if (!existsSync(file)) die(`${file} not found. Create it, or fetch remote secrets first with \`sanctum pull ${file}\`.`);
  const config = withPath(resolveConfig(), path);
  const profile = takeFlag(args, "--profile") ?? getProjectProfile(config.projectSlug);
  const sdk = await getClient(profile);
  await ensureRemotePath(sdk, config, env);
  const values = sdk.dotenv.parseDotenv(readFileSync(file, "utf8"));
  const keys = Object.keys(values);
  if (!keys.length) die(`No KEY=value pairs found in ${file}. Nothing to push.`);

  // preview against remote so the user sees exactly what changes
  const remote = await fetchMergedSecrets(sdk, config, env);
  const toAdd = keys.filter((k) => !(k in remote));
  const toUpdate = keys.filter((k) => k in remote && remote[k] !== values[k]);
  const same = keys.length - toAdd.length - toUpdate.length;
  const remoteOnly = Object.keys(remote).filter((k) => !(k in values));

  console.log(`${dim(file)} -> ${bold(config.projectSlug ?? config.projectId ?? "?")}/${env ?? config.environment ?? "dev"}${config.secretPath ?? "/"}`);
  for (const k of toAdd) console.log(`${green("+")} ${k}  ${dim("new")}`);
  for (const k of toUpdate) console.log(`${yellow("~")} ${k}  ${dim(maskValue(values[k]))}`);
  console.log(`${toAdd.length} to add, ${toUpdate.length} to update, ${same} unchanged, ${remoteOnly.length} remote-only (kept)`);

  if (dryRun) return;
  if (!toAdd.length && !toUpdate.length) {
    console.log("Nothing to push.");
    return;
  }
  if (!assumeYes && process.stdin.isTTY) {
    const ok = await select("Apply these changes?", [
      { label: "Yes", value: true },
      { label: "No", value: false }
    ]);
    if (!ok) {
      console.log("Aborted.");
      return;
    }
  }

  const scope = { ...scopeQuery(config, config.secretPath ?? "/", env), secretPath: config.secretPath ?? "/" };
  let pushed = 0;
  let approvals = 0;
  for (const key of [...toAdd, ...toUpdate]) {
    const result = await upsertSecret(sdk, key, values[key], scope);
    if (result.approval) {
      approvals += 1;
      console.log(`${yellow("?")} ${key}  ${dim(`queued for approval${result.approval.slug ? ` (${result.approval.slug})` : ""}`)}`);
    } else {
      pushed += 1;
    }
  }
  ok(`Pushed ${pushed} secrets to ${config.secretPath ?? "/"}${approvals ? `, ${approvals} pending approval` : ""}`);
};

const cmdDoctor = async (args: string[]) => {
  const profile = takeFlag(args, "--profile");
  const check = (ok: boolean, label: string, detail?: string) =>
    console.log(`  ${ok ? green(SYM.ok) : red(SYM.err)} ${label}${detail ? dim(`  ${detail}`) : ""}`);

  const credentials = loadCredentials(profile);
  check(Boolean(credentials), "credentials", credentials ? `profile "${profile ?? process.env.SANCTUM_PROFILE ?? "default"}"` : "not logged in (sanctum login)");
  if (!credentials) return;

  let reachable = false;
  try {
    const res = await fetch(`${credentials.baseUrl}/api/status`, { signal: AbortSignal.timeout(8000) });
    reachable = res.ok;
    check(res.ok, "instance", `${credentials.baseUrl} (HTTP ${res.status})`);
  } catch {
    check(false, "instance", `${credentials.baseUrl} unreachable`);
  }
  if (!reachable) return;

  const sdk = await getClientIfAvailable(profile);
  if (!sdk) return;
  try {
    const { projects } = await sdk.projects.list();
    check(true, "auth", `${projects.length} project(s) visible to this identity`);
    try {
      const config = resolveConfig();
      const slug = config.projectSlug ?? config.projectId;
      const visible = projects.some((p) => p.slug === slug || p.id === slug);
      check(visible, "project access", visible ? `'${slug}'` : `identity can't see '${slug}' - grant it membership in project settings`);
    } catch {
      console.log(dim("  - config       none here (no sanctum-config.json in tree)"));
    }
  } catch (e) {
    check(false, "auth", e instanceof Error ? e.message : String(e));
  }
};

const AGENTS_SNIPPET = `<!-- generated by sanctum-cli@${VERSION} - refresh with \`sanctum agents --force\` -->
## Secrets management (Sanctum)

This project uses the Sanctum CLI for secrets. Do NOT create or commit .env files
with real values.

- \`sanctum-config.json\` links this directory to a Sanctum project/environment/secret
  path. It is committed and contains no secrets.
- Run the app with \`sanctum run -- <command>\` (e.g. \`sanctum run -- npm run dev\`).
  Secrets are injected as env vars at launch.
- \`sanctum secrets list\` / \`get <KEY>\` / \`set <KEY>=<v>\` / \`rm <KEY>\` read and
  write remote secrets.
- \`sanctum diff\` compares a local file against remote, \`sanctum pull\` writes remote
  secrets into a local file, \`sanctum push\` uploads a local file's keys with a preview.
- Never paste secret values into chat, commits, or docs.

### Agent setup (non-interactive)

Never rely on interactive prompts. Everything is flag- or env-driven. The npm package
is \`sanctum-cli\` (install: \`npm i -g sanctum-cli\`), NOT \`sanctum\` (unrelated package).

- One-shot setup: \`sanctum setup --project <slug> --env dev --path /apps/api\` runs
  login + init + AGENTS.md in one pass. Add \`--all-envs\` to provision the path in
  every environment.
- Credentials: \`SANCTUM_BASE_URL\` + \`SANCTUM_TOKEN\`, or \`SANCTUM_CLIENT_ID\` +
  \`SANCTUM_CLIENT_SECRET\` (Universal Auth machine identity). If none exist, stop and
  ask the user for credentials. Do not invent tokens. Interactive users can run
  \`sanctum login --browser\` to auth through the web UI.
- Link a project: \`sanctum init --project <slug> --env dev --path /apps/api\`.
  Writes \`sanctum-config.json\` and auto-creates the remote folder path when
  credentials are present.
- Provision paths upfront: \`sanctum folders create /apps/api --all-envs\` covers every
  environment at once. Nested paths (\`/a/b/c\`) work and are idempotent.
- Inspect state: \`sanctum status\` prints the resolved config (project, env, merged
  paths). \`sanctum whoami\` prints the active profile, instance URL, and token expiry.
  \`sanctum doctor\` checks credentials, instance reachability, auth, and whether this
  identity can see the configured project.
- Overrides: \`--env staging\` works on secrets/diff/pull/push/run/folders/files.
  \`--path /other\` works on secrets, files, diff, pull, push, export.
  \`--profile name\` selects credentials.

### Secret paths are vault-side, not filesystem

- \`secretPath\` is a folder namespace on the Sanctum server, NOT a path on disk.
  \`/mrhr-api\` never maps to \`./mrhr-api\` directly - it only mirrors the repo
  layout by convention (\`init\` defaults it from the directory name).
- Secrets and files share the same path namespace. \`secrets list\` hides file
  secrets; \`files list\` shows only files.
- The merged view walks ancestor paths: a leaf at \`/apps/api\` inherits keys from
  \`/\` and \`/apps\`. \`imports: ["/shared"]\` adds more paths to the merge.
- \`secrets list --exact\` shows only the leaf path (no inherited keys).

### File secrets (binary)

- \`sanctum files push <path>\` uploads the raw file to the file store
  (\`/api/v3/files\`, encrypted at rest, 32 MB cap) under the file's basename,
  with \`localPath\` (repo-relative path at push time) and \`sha256\` metadata.
  On backends without the file API it falls back to a base64 KV secret under
  key \`FILE__<NAME>\` (~700 KB cap, \`kind=file\` metadata).
- \`sanctum files pull\` restores each file to its recorded \`localPath\` relative
  to cwd (no path argument needed). \`--to <dir>\` redirects to a directory,
  \`--force\` overwrites locally-modified files (sha256 mismatch is refused).
  A stored \`localPath\` that escapes the project (\`../\`, absolute) is refused;
  use \`--to\` to extract those files safely.
- \`sanctum files diff\` compares local file sha256 against stored metadata
  without downloading content.
- KV file secrets are EXCLUDED from \`pull\`, \`export\`, \`diff\`, \`run\`, and
  \`secrets list\` by default (base64 blobs would pollute .env files). Pass
  \`--include-files\` to pull/export/diff to include them.
- Escape hatch for raw base64: \`secrets set <KEY> --file <path>\` /
  \`secrets get <KEY> --file <out>\` (no metadata, not excluded from env ops).

### Monorepo layout

- Bootstrap: \`sanctum init --all --project <slug>\` at the root writes the root config
  and links every child dir containing a package.json or .env to \`/<dirname>\`.
- Each sub-app gets its own \`sanctum-config.json\`. Running \`sanctum init\` inside a
  child dir auto-registers it in the root config's \`projects\` map.
- Configs merge root to leaf. Ancestor \`secretPath\` and \`imports\` act as shared
  secrets. The leaf path wins on key conflicts.
- \`imports: ["/shared"]\` in a config pulls an extra remote path into the merge.
- \`sanctum pull --all\` / \`sanctum diff --all\` iterate every registered child.
- A single root config can hold inline projects instead:
  \`"projects": {"apps/api": {"projectSlug": "...", "secretPath": "/apps/api"}}\`.

### Notes

- Secret paths are folders on the server. Writes auto-create the configured path, so
  \`sanctum push\` and \`secrets set\` just work. Use \`folders create\` only to
  provision paths ahead of time or across environments.
- Environment values are slugs (\`dev\`, \`staging\`, \`prod\`), not display names.
- Secret values are masked in \`diff\` output unless \`--values\` is passed. Keep them masked.
- Profiles are personal and live in \`~/.sanctum/credentials.json\`. Never write
  profile names or credentials into \`sanctum-config.json\`.

### When a tool needs a real .env file

Some tools read a file, not process env (Prisma CLI, some Docker setups). Use
\`sanctum pull .env\` or \`sanctum export --out .env\` to materialize one locally,
add \`.env\` to \`.gitignore\`, and treat it as disposable. Pull again to refresh.
Never commit it. \`sanctum run -- <cmd>\` remains preferred whenever the tool
honors process env.

### Write approvals

A write can return \`queued for approval\` instead of landing, when the project
has a change-approval policy on that env/path. The secret is NOT live until
approved in the web UI. Tell the user when this happens. \`secrets set\` and
\`push\` surface it; reads and diffs are never queued.
`;

const pickFlags = (args: string[], names: string[]): string[] => {
  const out: string[] = [];
  for (const n of names) {
    const v = takeFlag(args, n);
    if (v !== undefined) out.push(n, v);
  }
  return out;
};

/** One-shot onboarding: login (if needed) + init + optional all-envs provisioning + AGENTS.md. */
const cmdSetup = async (args: string[]) => {
  const allEnvs = hasFlag(args, "--all-envs");
  const skipAgents = hasFlag(args, "--no-agents");
  const profile = takeFlag(args, "--profile");
  const profileArgs = profile ? ["--profile", profile] : [];

  const browser = hasFlag(args, "--browser");
  const loginArgs = [
    ...pickFlags(args, ["--base-url", "--token", "--client-id", "--client-secret"]),
    ...(browser ? ["--browser"] : []),
    ...profileArgs
  ];
  const hasCredFlags = loginArgs.some((a) => a === "--token" || a === "--client-id");

  if (hasCredFlags || !loadCredentials(profile)) {
    await cmdLogin(loginArgs);
  } else {
    console.log(`Using existing profile "${profile ?? process.env.SANCTUM_PROFILE ?? "default"}".`);
  }

  await cmdInit([...args, ...profileArgs]);

  if (allEnvs) {
    const config = resolveConfig();
    await cmdFolders(["create", config.secretPath ?? "/", "--all-envs", ...profileArgs]);
  }

  if (!skipAgents) cmdAgents([]);
};

const cmdAgents = (args: string[]) => {
  const force = hasFlag(args, "--force");
  const target = join(process.cwd(), "AGENTS.md");
  let existing = existsSync(target) ? readFileSync(target, "utf8") : "";
  if (existing.includes("Secrets management (Sanctum)")) {
    if (!force) {
      console.log("AGENTS.md already has a Sanctum section. Use --force to replace it.");
      return;
    }
    const marker = existing.indexOf("<!-- generated by sanctum-cli@");
    const heading = existing.indexOf("## Secrets management (Sanctum)");
    const start = marker !== -1 && marker < heading ? marker : heading;
    const next = existing.indexOf("\n## ", start + 1);
    existing = (next === -1 ? existing.slice(0, start) : existing.slice(0, start) + existing.slice(next)).trimEnd() + "\n";
  }
  writeFileSync(target, existing.trimEnd() + "\n" + AGENTS_SNIPPET);
  console.log(`Appended Sanctum section to ${target}`);
};

const HELP = `sanctum - CLI for the Sanctum secrets platform

Usage:
  sanctum setup                                    one-shot: login + init + AGENTS.md
              [--base-url x] [--browser|--token|--client-id/--client-secret] [--project x] [--env x] [--path /x]
              [--all-envs] [--no-agents] [--profile name]
  sanctum login [--browser] | --token <token> | --client-id <id> --client-secret <secret>
              [--base-url <url>] [--profile name]    (--browser opens the web UI and catches the token)
  sanctum profiles                                   list saved credential profiles
  sanctum profiles use                               pick which profile this project uses (local-only)
  sanctum init [--project <id-or-slug>] [--env dev] [--path /apps/api] [--imports /shared] [--profile name]
                                 (interactive picker when --project is omitted;
                                  --all links every child dir with package.json/.env)
  sanctum projects list [--profile name]
  sanctum status                                    show resolved config + linked monorepo projects
  sanctum doctor [--profile name]                   diagnose credentials, instance, auth, project access
  sanctum agents                                    add a Sanctum usage section to ./AGENTS.md
  sanctum envs
  sanctum folders create <path> [--env x] [--all-envs]  create a secret path (nested ok, idempotent)
  sanctum folders list [--env x] [--path /x]
  sanctum files push <file> | pull [--to dir] [--force] | list | diff   binary secrets (base64 + sha256 + localPath metadata)
  sanctum secrets list [--exact]|get <KEY> [--file out]|set <KEY>=<v>|set <KEY> --file <bin>|rm <KEY> [--yes]
              [--env x] [--path /x] [--profile name]
  sanctum export [--env x] [--path /x] [--format dotenv|json] [--out file]
  sanctum diff [file] [--env x] [--path /x] [--values] [--all]  compare local .env against remote secrets
  sanctum pull [file] [--env x] [--path /x] [--all] [--yes]     fetch remote secrets into a local .env
  sanctum push [file] [--env x] [--path /x] [--dry-run] [--yes] push a .env file's keys to a secret path
  sanctum run [--env x] [--profile x] -- <cmd>

Discovery: commands read the nearest sanctum-config.json upward from cwd.
Ancestor configs merge in root->leaf order so shared folders apply repo-wide.
The config file is safe to commit - credentials live in ~/.sanctum/credentials.json,
keyed by profile. Profile resolution: --profile > SANCTUM_PROFILE > config "profile" > "default".
`;

const main = async () => {
  const args = process.argv.slice(2);
  const cmd = args.shift();

  const dispatch = async () => {
    switch (cmd) {
      case "login": return await cmdLogin(args);
      case "setup": return await cmdSetup(args);
      case "profiles": return await cmdProfiles(args);
      case "init": return await cmdInit(args);
      case "projects": return await cmdProjects(args);
      case "status": return await cmdStatus();
      case "doctor": return await cmdDoctor(args);
      case "agents": return cmdAgents(args);
      case "envs": return await cmdEnvs(args);
      case "folders": return await cmdFolders(args);
      case "files": return await cmdFiles(args);
      case "secrets": return await cmdSecrets(args);
      case "export": return await cmdExport(args);
      case "diff": return await cmdDiff(args);
      case "pull": return await cmdPull(args);
      case "push": return await cmdEnvFile(args);
      case "run": return await cmdRun(args);
      case "whoami": {
        const profileFlag = takeFlag(args, "--profile");
        const credentials = loadCredentials(profileFlag);
        if (!credentials) return die("Not logged in.");
        const claims = credentials.accessToken ? decodeJwtPayload(credentials.accessToken) : null;
        const exp = claims?.exp ? new Date(Number(claims.exp) * 1000) : null;
        const valid = !exp || exp.getTime() > Date.now();

        console.log(`${green(SYM.dot)} ${bold("logged in")} ${dim(`as profile`)} ${cyan(profileFlag ?? process.env.SANCTUM_PROFILE ?? "default")}\n`);
        console.log(`  ${dim("instance")}   ${credentials.baseUrl}`);
        if (credentials.clientId) console.log(`  ${dim("clientId")}   ${credentials.clientId}`);
        if (claims?.identityId) console.log(`  ${dim("identity")}   ${String(claims.identityId)}`);
        if (claims?.orgId) console.log(`  ${dim("org")}        ${String(claims.orgId)}`);
        if (exp) {
          const expired = exp.getTime() <= Date.now();
          console.log(`  ${dim("token")}      ${expired ? red("expired") : "valid until"} ${exp.toLocaleString()}`);
        }
        if (!valid) console.log(dim("\n  token expired - next command will re-authenticate via clientId/secret"));
        return;
      }
      case "--version":
      case "-v":
      case "version":
        console.log(VERSION);
        return;
      default:
        console.log(HELP);
        if (cmd && cmd !== "help" && cmd !== "--help") process.exit(1);
    }
  };

  try {
    await dispatch();
    const unknown = args.filter((a) => /^-{1,2}[a-zA-Z]/.test(a));
    if (unknown.length) console.error(yellow(`warning: ignored unknown flag(s): ${unknown.join(" ")}`));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "__cli_exit") return;
    const out = /folder with path/i.test(msg) ? `${msg} (create it with \`sanctum folders create <path>\`)` : msg;
    console.error(`${red(SYM.err)} ${out}`);
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 1500).unref();
  }
};

void main();
