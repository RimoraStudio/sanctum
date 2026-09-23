import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const CONFIG_FILENAME = "sanctum-config.json";
const CREDENTIALS_DIR = ".sanctum";
const CREDENTIALS_FILE = "credentials.json";

export interface ProjectConfig {
  projectId?: string;
  projectSlug?: string;
  environment?: string;
  secretPath?: string;
  imports?: string[];
  profile?: string;
  /** monorepo index: relative dir -> its sanctum-config.json path (or inline context) */
  projects?: Record<string, string | { projectSlug?: string; secretPath?: string; environment?: string }>;
}

export interface ResolvedConfig extends ProjectConfig {
  /** secret paths to merge, ordered root -> leaf (last wins) */
  paths: string[];
  configFile: string;
}

export interface Credentials {
  baseUrl: string;
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
}

interface CredentialStore {
  default?: string;
  profiles: Record<string, Credentials>;
}

const credentialsPath = () => join(homedir(), CREDENTIALS_DIR, CREDENTIALS_FILE);

const readStore = (): CredentialStore => {
  const path = credentialsPath();
  if (!existsSync(path)) return { profiles: {} };

  const raw = JSON.parse(readFileSync(path, "utf8")) as CredentialStore | Credentials;
  // migrate flat { baseUrl, accessToken, ... } shape to profiles
  if ("baseUrl" in raw && typeof raw.baseUrl === "string") {
    return { default: "default", profiles: { default: raw as Credentials } };
  }
  return raw as CredentialStore;
};

/**
 * Credential resolution order:
 *   SANCTUM_TOKEN / SANCTUM_CLIENT_* env vars  >  explicit profile  >  default profile
 */
export const loadCredentials = (profile?: string): Credentials | null => {
  const baseUrl = process.env.SANCTUM_BASE_URL ?? "http://localhost:4000";

  if (process.env.SANCTUM_TOKEN) {
    return { baseUrl, accessToken: process.env.SANCTUM_TOKEN };
  }
  if (process.env.SANCTUM_CLIENT_ID && process.env.SANCTUM_CLIENT_SECRET) {
    return {
      baseUrl,
      clientId: process.env.SANCTUM_CLIENT_ID,
      clientSecret: process.env.SANCTUM_CLIENT_SECRET
    };
  }

  const store = readStore();
  const name = profile ?? process.env.SANCTUM_PROFILE ?? store.default ?? "default";
  const stored = store.profiles[name];
  if (!stored) return null;

  return { ...stored, baseUrl: process.env.SANCTUM_BASE_URL ?? stored.baseUrl };
};

export const saveCredentials = (credentials: Credentials, profile = "default"): void => {
  const store = readStore();
  store.profiles[profile] = credentials;
  store.default = store.default ?? profile;
  const path = credentialsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2) + "\n", { mode: 0o600 });
};

export const listProfiles = (): { name: string; isDefault: boolean; baseUrl: string }[] => {
  const store = readStore();
  return Object.entries(store.profiles).map(([name, c]) => ({
    name,
    isDefault: store.default === name,
    baseUrl: c.baseUrl
  }));
};

/**
 * Walk up from `startDir` collecting every sanctum-config.json.
 * The nearest config is authoritative for projectId/environment/secretPath.
 * Ancestor configs contribute their secretPath + imports so shared folders
 * declared higher in a monorepo merge in (deepest path wins on key conflicts).
 */
export const resolveConfig = (startDir: string = process.cwd()): ResolvedConfig => {
  const configs: { dir: string; config: ProjectConfig }[] = [];

  let dir = resolve(startDir);
  for (;;) {
    const file = join(dir, CONFIG_FILENAME);
    if (existsSync(file)) {
      configs.push({ dir, config: JSON.parse(readFileSync(file, "utf8")) as ProjectConfig });
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  if (!configs.length) {
    throw new Error(
      `No ${CONFIG_FILENAME} found in this directory or any parent. Run \`sanctum init\` first.`
    );
  }

  // If the nearest config's own projects map has an entry covering cwd,
  // merge it as a synthetic leaf config (single-config monorepo support).
  let primary = configs[0].config;
  let primaryFile = join(configs[0].dir, CONFIG_FILENAME);

  for (const { dir, config } of configs) {
    if (!config.projects) continue;
    for (const [rel, entry] of Object.entries(config.projects)) {
      const childDir = resolve(dir, rel);
      if (resolve(startDir) === childDir || resolve(startDir).startsWith(childDir + "\\") || resolve(startDir).startsWith(childDir + "/")) {
        if (typeof entry === "object") {
          primary = { ...config, projects: undefined, ...entry };
          primaryFile = join(dir, rel, CONFIG_FILENAME);
        }
      }
    }
  }

  const paths: string[] = [];

  // configs are collected leaf -> root; iterate root -> leaf so deeper
  // configs (and their imports) win on key conflicts
  for (const { config } of [...configs].reverse()) {
    for (const imp of config.imports ?? []) {
      if (!paths.includes(imp)) paths.push(imp);
    }
    const p = config.secretPath ?? "/";
    if (!paths.includes(p)) paths.push(p);
  }
  if (primary !== configs[0].config) {
    for (const imp of primary.imports ?? []) {
      if (!paths.includes(imp)) paths.push(imp);
    }
    const p = primary.secretPath ?? "/";
    if (!paths.includes(p)) paths.push(p);
  }

  return {
    ...primary,
    paths,
    configFile: primaryFile
  };
};

/**
 * Register a child config in the outermost ancestor sanctum-config.json so a
 * monorepo root tracks every linked app: `projects: { "apps/api": "apps/api/sanctum-config.json" }`.
 * Returns the ancestor config file that was updated, or null if none exists.
 */
export const registerChildConfig = (childDir: string, startDir: string = childDir): string | null => {
  const parentConfigs: { dir: string; file: string }[] = [];
  let dir = dirname(resolve(startDir));
  for (;;) {
    const file = join(dir, CONFIG_FILENAME);
    if (existsSync(file)) parentConfigs.push({ dir, file });
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (!parentConfigs.length) return null;

  const root = parentConfigs[parentConfigs.length - 1];
  const config = JSON.parse(readFileSync(root.file, "utf8")) as ProjectConfig;
  const rel = resolve(childDir) === resolve(root.dir)
    ? "."
    : resolve(childDir).slice(resolve(root.dir).length + 1).replace(/\\/g, "/");

  config.projects = { ...(config.projects ?? {}), [rel]: `${rel}/${CONFIG_FILENAME}` };
  writeFileSync(root.file, JSON.stringify(config, null, 2) + "\n");
  return root.file;
};

export const writeProjectConfig = (dir: string, config: ProjectConfig): string => {
  const file = join(dir, CONFIG_FILENAME);
  writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
  return file;
};
