import { SanctumClient, type ClientOptions } from "./client.js";
import { createAuth, type AuthApi } from "./auth.js";
import { createProjects, type ProjectsApi } from "./projects.js";
import { createSecrets, type SecretsApi } from "./secrets.js";
import { createFolders, type FoldersApi } from "./folders.js";
import { createDotenv, type DotenvApi } from "./dotenv.js";

export * from "./client.js";
export * from "./auth.js";
export * from "./projects.js";
export * from "./secrets.js";
export * from "./folders.js";
export * from "./dotenv.js";

export interface SanctumSdk extends SanctumClient {
  auth: AuthApi;
  projects: ProjectsApi;
  secrets: SecretsApi;
  folders: FoldersApi;
  dotenv: DotenvApi;
}

export class SanctumSdk extends SanctumClient {
  auth: AuthApi;
  projects: ProjectsApi;
  secrets: SecretsApi;
  folders: FoldersApi;
  dotenv: DotenvApi;

  constructor(options: ClientOptions = {}) {
    super(options);
    this.auth = createAuth(this);
    this.projects = createProjects(this);
    this.secrets = createSecrets(this);
    this.folders = createFolders(this);
    this.dotenv = createDotenv();
  }
}

export const createClient = (options: ClientOptions = {}): SanctumSdk => {
  return new SanctumSdk(options);
};

export default createClient;
