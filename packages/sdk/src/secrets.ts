import type { QueryValue, SanctumClient } from "./client.js";

export interface Secret {
  id: string;
  secretKey: string;
  secretValue?: string;
  secretComment?: string;
  version: number;
  type: "shared" | "personal";
  secretPath?: string;
  secretValueHidden: boolean;
  tags?: { id: string; slug: string; name?: string; color?: string }[];
  secretMetadata?: { key: string; value: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface ListSecretsOptions extends Record<string, QueryValue> {
  workspaceId?: string;
  workspaceSlug?: string;
  environment?: string;
  secretPath?: string;
  viewSecretValue?: boolean;
  expandSecretReferences?: boolean;
  recursive?: boolean;
  include_imports?: boolean;
  tagSlugs?: string;
}

export interface ListSecretsOutput {
  secrets: Secret[];
  imports?: {
    secretPath: string;
    environment: string;
    folderId?: string;
    secrets: Secret[];
  }[];
}

export interface SecretScopeInput {
  workspaceId?: string;
  workspaceSlug?: string;
  projectSlug?: string;
  environment: string;
  secretPath?: string;
  type?: "shared" | "personal";
}

export interface CreateSecretInput extends SecretScopeInput {
  secretValue: string;
  secretComment?: string;
  secretMetadata?: { key: string; value: string }[];
  skipMultilineEncoding?: boolean;
}

export interface UpdateSecretInput extends SecretScopeInput {
  secretValue?: string;
  secretComment?: string;
  secretMetadata?: { key: string; value: string }[];
  tags?: string[];
  skipMultilineEncoding?: boolean;
}

export interface BatchSecretOperation {
  type: "create" | "update" | "delete";
  secretName: string;
  secretValue?: string;
  secretComment?: string;
  tags?: string[];
}

export interface SecretWriteResult {
  secret?: Secret;
  /** present when a change-approval policy intercepted the write instead */
  approval?: { id: string; slug?: string; status?: string };
}

export interface SecretsApi {
  list(options: ListSecretsOptions): Promise<ListSecretsOutput>;
  get(secretName: string, scope: SecretScopeInput & { expandSecretReferences?: boolean; version?: number }): Promise<{ secret: Secret }>;
  create(secretName: string, input: CreateSecretInput): Promise<SecretWriteResult>;
  update(secretName: string, input: UpdateSecretInput): Promise<SecretWriteResult>;
  delete(secretName: string, scope: SecretScopeInput): Promise<SecretWriteResult>;
  batch(scope: SecretScopeInput, operations: BatchSecretOperation[]): Promise<unknown>;
}

export const createSecrets = (client: SanctumClient): SecretsApi => ({
  list: (options) =>
    client.get<ListSecretsOutput>("/api/v3/secrets/raw", {
      query: options as Record<string, QueryValue>
    }),

  get: (secretName, scope) =>
    client.get<{ secret: Secret }>(`/api/v3/secrets/raw/${encodeURIComponent(secretName)}`, {
      query: scope as unknown as Record<string, QueryValue>
    }),

  create: (secretName, input) =>
    client.post<SecretWriteResult>(`/api/v3/secrets/raw/${encodeURIComponent(secretName)}`, {
      type: "shared",
      secretPath: "/",
      ...input
    }),

  update: (secretName, input) =>
    client.patch<SecretWriteResult>(`/api/v3/secrets/raw/${encodeURIComponent(secretName)}`, {
      type: "shared",
      secretPath: "/",
      ...input
    }),

  delete: (secretName, scope) =>
    client.request<SecretWriteResult>(`/api/v3/secrets/raw/${encodeURIComponent(secretName)}`, {
      method: "DELETE",
      body: { type: "shared", secretPath: "/", ...scope }
    }),

  batch: (scope, operations) =>
    client.post<unknown>("/api/v3/secrets/batch/raw", {
      secretPath: "/",
      type: "shared",
      ...scope,
      secrets: operations
    })
});
