#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";

import { SanctumApiError, SanctumSdk } from "sanctum-sdk";

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
const c = (code: string, s: string | number) => (useColor ? `[${code}m${s}[0m` : String(s));
const bold = (s: string | number) => c("1", s);
const dim = (s: string | number) => c("2", s);
const green = (s: string | number) => c("32", s);
const yellow = (s: string | number) => c("33", s);
const red = (s: string | number) => c("31", s);
const cyan = (s: string | number) => c("36", s);

const die = (message: string, code = 1): never => {
  console.error(`${red("âœ—")} ${message}`);
  process.exit(code);
};

const ok = (message: string) => console.log(`${green("âœ“")} ${message}`);

/** Decode a JWT payload without verification â€” display only. */
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

/** Fetch and merge secrets across all resolved paths; last path wins on conflicts. */
const fetchMergedSecrets = async (
  sdk: SanctumSdk,
  config: ResolvedConfig,
  env?: string
): Promise<Record<string, string>> => {
  const merged: Record<string, string> = {};
  for (const path of config.paths) {
    const { secrets, imports } = await sdk.secrets.list({
      ...scopeQuery(config, path, env),
      viewSecretValue: true,
      expandSecretReferences: true,
      include_imports: true
    });
    for (const imp of imports ?? []) {
      for (const s of imp.secrets) merged[s.secretKey] = s.secretValue ?? "";
    }
    for (const s of secrets) merged[s.secretKey] = s.secretValue ?? "";
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

// ---------- commands ----------

const cmdLogin = async (args: string[]) => {
  let baseUrl = takeFlag(args, "--base-url");
  let token = takeFlag(args, "--token");
  let clientId = takeFlag(args, "--client-id");
  let clientSecret = takeFlag(args, "--client-secret");
  let profile = takeFlag(args, "--profile");

  if (!token && !(clientId && clientSecret)) {
    if (!process.stdin.isTTY) {
      die("Provide --token, or --client-id + --client-secret.");
    }

    const step = (n: number, total: number, label: string) =>
      console.log(`\n[${n}/${total}] ${label}`);

    step(1, 4, "Sanctum instance");
    baseUrl = baseUrl ?? (await input("URL", "http://localhost:4000"));

    step(2, 4, "Login method");
    const method = await select("How do you want to log in?", [
      { label: "Machine identity", value: "ua", hint: "clientId + clientSecret â€” recommended for dev/CI" },
      { label: "Access token", value: "token", hint: "paste a user or identity token" }
    ]);

    step(3, 4, "Credentials");
    if (method === "ua") {
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

  const configFile = join(process.cwd(), "sanctum-config.json");
  const force = hasFlag(args, "--force");
  if (existsSync(configFile) && !force) {
    if (!process.stdin.isTTY) {
      die("sanctum-config.json already exists. Re-run with --force to overwrite.");
    }
    const existing = JSON.parse(readFileSync(configFile, "utf8")) as Record<string, unknown>;
    console.log(`${yellow("!")} existing config: ${existing.projectSlug ?? existing.projectId} @ ${existing.environment ?? "dev"} ${existing.secretPath ?? "/"}`);
    const overwrite = await select("Overwrite it?", [
      { label: "Yes", value: true },
      { label: "No", value: false }
    ]);
    if (!overwrite) {
      console.log("Keeping existing config.");
      return;
    }
  }

  const file = writeProjectConfig(process.cwd(), config);
  const rootFile = registerChildConfig(process.cwd());
  console.log(`Wrote ${file}`);
  if (rootFile) console.log(`Registered in ${rootFile}`);
  console.log(`  project:     ${project}`);
  console.log(`  environment: ${environment}`);
  console.log(`  secretPath:  ${secretPath}${imports.length ? ` (+ imports: ${imports.join(", ")})` : ""}${profile ? `, profile: ${profile} (local only)` : ""}`);
};

const cmdStatus = () => {
  const config = resolveConfig();
  console.log(`${cyan("â—")} ${bold(config.projectSlug ?? config.projectId ?? "?")} ${dim(`@ ${config.environment ?? "dev"}`)}\n`);
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
  scope: Record<string, unknown>
): Promise<{ verb: "Created" | "Updated"; approval?: { id: string; slug?: string } }> => {
  try {
    const r = await sdk.secrets.create(key, { ...scope, secretValue } as never);
    return { verb: "Created", approval: r.approval };
  } catch (err) {
    const conflict = err instanceof SanctumApiError && /exist|conflict/i.test(err.message);
    if (!conflict) throw err;
    const r = await sdk.secrets.update(key, { ...scope, secretValue } as never);
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
      const merged = await fetchMergedSecrets(sdk, config, env);
      const keys = Object.keys(merged).sort();
      for (const k of keys) console.log(k);
      const scopeLabel = `${env ?? config.environment ?? "dev"} @ ${config.paths.join(", ")}`;
      console.log(dim(`\n${keys.length} secrets (${scopeLabel})`));
      if (!keys.length) console.log(dim(`empty or missing path. Check with \`sanctum folders list\` or create with \`sanctum folders create <path>\`.`));
      break;
    }
    case "get": {
      const key = args[0];
      if (!key) die("Usage: sanctum secrets get <KEY>");
      const { secret } = await sdk.secrets.get(key, scope());
      console.log(secret.secretValue ?? "");
      break;
    }
    case "set": {
      const pair = args[0];
      if (!pair?.includes("=")) die("Usage: sanctum secrets set <KEY>=<value>");
      const [key, ...rest] = pair.split("=");
      const value = rest.join("=");
      await ensureRemotePath(sdk, config, env);
      const result = await upsertSecret(sdk, key, value, scope());
      if (result.approval) console.log(`${yellow("?")} ${key} queued for approval${result.approval.slug ? ` (${result.approval.slug})` : ""}`);
      else ok(`${result.verb} ${key}`);
      break;
    }
    case "rm":
    case "delete": {
      const key = args[0];
      if (!key) die("Usage: sanctum secrets rm <KEY>");
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

const maskValue = (v: string): string => (v.length <= 4 ? "****" : `${v.slice(0, 2)}***${v.slice(-2)}`);

const diffOne = async (
  sdk: SanctumSdk,
  config: ResolvedConfig,
  file: string,
  env: string | undefined,
  showValues: boolean
) => {
  const local = existsSync(file) ? sdk.dotenv.parseDotenv(readFileSync(file, "utf8")) : {};
  const remote = await fetchMergedSecrets(sdk, config, env);

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
      (existsSync(file) ? `  [${file} vs ${config.projectSlug ?? config.projectId}/${config.environment ?? "dev"}]` : `  [no ${file} â€” showing remote-only]`)
  );
};

const cmdDiff = async (args: string[]) => {
  const env = takeFlag(args, "--env");
  const showValues = hasFlag(args, "--values");
  const all = hasFlag(args, "--all");
  const config = resolveConfig();
  const profile = takeFlag(args, "--profile") ?? getProjectProfile(config.projectSlug);
  const file = args[0] ?? ".env";
  const sdk = await getClient(profile);

  // monorepo: root config registers linked children â€” offer a scope pick
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
      await diffOne(sdk, childConfig, join(childDir, file), env, showValues);
    }
    if (selected.length) return;
  }

  await diffOne(sdk, config, file, env, showValues);
};

const cmdExport = async (args: string[]) => {
  const env = takeFlag(args, "--env");
  const format = takeFlag(args, "--format") ?? "dotenv";
  const outFile = takeFlag(args, "--out");
  const config = resolveConfig();
  const profile = takeFlag(args, "--profile") ?? getProjectProfile(config.projectSlug);
  const sdk = await getClient(profile);
  const merged = await fetchMergedSecrets(sdk, config, env);

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
  skipConfirm = false
) => {
  const merged = await fetchMergedSecrets(sdk, config, env);
  if (existsSync(outFile)) {
    const { text, updated, added } = mergeDotenv(readFileSync(outFile, "utf8"), merged);
    if (!updated && !added) {
      ok(`${outFile} already in sync â€” no changes.`);
      return;
    }
    if (!skipConfirm && process.stdin.isTTY) {
      const proceed = await select(`${outFile}: update ${updated}, add ${added} â€” apply?`, [
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
  const all = hasFlag(args, "--all");
  const yes = hasFlag(args, "--yes") || hasFlag(args, "-y") || hasFlag(args, "--force");
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
      await pullOne(sdk, resolveConfig(childDir), join(childDir, file), env, yes);
    }
    if (selected.length) {
      console.log("note: pulled files contain real secret values â€” keep them out of git.");
      return;
    }
  }

  await pullOne(sdk, config, file, env, yes);
  console.log("note: pulled files contain real secret values â€” keep them out of git.");
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
        `(paths: ${config.paths.join(", ")}) â€” check the environment and paths exist.`
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
  const file = args[0] ?? ".env";
  if (!existsSync(file)) die(`${file} not found. Create it, or fetch remote secrets first with \`sanctum pull ${file}\`.`);
  const config = resolveConfig();
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
    console.log(`  ${ok ? green("✓") : red("✗")} ${label}${detail ? dim(`  ${detail}`) : ""}`);

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
      console.log(dim("  · config       none here (no sanctum-config.json in tree)"));
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
  ask the user for credentials. Do not invent tokens.
- Link a project: \`sanctum init --project <slug> --env dev --path /apps/api\`.
  Writes \`sanctum-config.json\` and auto-creates the remote folder path when
  credentials are present.
- Provision paths upfront: \`sanctum folders create /apps/api --all-envs\` covers every
  environment at once. Nested paths (\`/a/b/c\`) work and are idempotent.
- Inspect state: \`sanctum status\` prints the resolved config (project, env, merged
  paths). \`sanctum whoami\` prints the active profile, instance URL, and token expiry.
  \`sanctum doctor\` checks credentials, instance reachability, auth, and whether this
  identity can see the configured project.
- Overrides: \`--env staging\` works on secrets/diff/pull/push/run/folders.
  \`--path /other\` works on secrets commands. \`--profile name\` selects credentials.

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

  const loginArgs = [...pickFlags(args, ["--base-url", "--token", "--client-id", "--client-secret"]), ...profileArgs];
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

const HELP = `sanctum â€” CLI for the Sanctum secrets platform

Usage:
  sanctum setup                                    one-shot: login + init + AGENTS.md
              [--base-url x] [--token|--client-id/--client-secret] [--project x] [--env x] [--path /x]
              [--all-envs] [--no-agents] [--profile name]
  sanctum login --token <token> | --client-id <id> --client-secret <secret> [--base-url <url>] [--profile name]
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
  sanctum secrets list|get <KEY>|set <KEY>=<value>|rm <KEY> [--env x] [--path /x] [--profile name]
  sanctum export [--env x] [--format dotenv|json] [--out file]
  sanctum diff [file] [--env x] [--values] [--all]  compare local .env against remote secrets
  sanctum pull [file] [--env x] [--all] [--yes]     fetch remote secrets into a local .env
  sanctum push [file] [--env x] [--dry-run] [--yes] push a .env file's keys to your configured secretPath
  sanctum run [--env x] [--profile x] -- <cmd>

Discovery: commands read the nearest sanctum-config.json upward from cwd.
Ancestor configs merge in root->leaf order so shared folders apply repo-wide.
The config file is safe to commit â€” credentials live in ~/.sanctum/credentials.json,
keyed by profile. Profile resolution: --profile > SANCTUM_PROFILE > config "profile" > "default".
`;

const main = async () => {
  const args = process.argv.slice(2);
  const cmd = args.shift();

  try {
    switch (cmd) {
      case "login": return await cmdLogin(args);
      case "setup": return await cmdSetup(args);
      case "profiles": return await cmdProfiles(args);
      case "init": return await cmdInit(args);
      case "projects": return await cmdProjects(args);
      case "status": return cmdStatus();
      case "doctor": return await cmdDoctor(args);
      case "agents": return cmdAgents(args);
      case "envs": return await cmdEnvs(args);
      case "folders": return await cmdFolders(args);
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

        console.log(`${green("â—")} ${bold("logged in")} ${dim(`as profile`)} ${cyan(profileFlag ?? process.env.SANCTUM_PROFILE ?? "default")}\n`);
        console.log(`  ${dim("instance")}   ${credentials.baseUrl}`);
        if (credentials.clientId) console.log(`  ${dim("clientId")}   ${credentials.clientId}`);
        if (claims?.identityId) console.log(`  ${dim("identity")}   ${String(claims.identityId)}`);
        if (claims?.orgId) console.log(`  ${dim("org")}        ${String(claims.orgId)}`);
        if (exp) {
          const expired = exp.getTime() <= Date.now();
          console.log(`  ${dim("token")}      ${expired ? red("expired") : "valid until"} ${exp.toLocaleString()}`);
        }
        if (!valid) console.log(dim("\n  token expired â€” next command will re-authenticate via clientId/secret"));
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    die(/folder with path/i.test(msg) ? `${msg} (create it with \`sanctum folders create <path>\`)` : msg);
  }
};

void main();
