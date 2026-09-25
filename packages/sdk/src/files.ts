import type { QueryValue, SanctumClient } from "./client.js";
import { SanctumApiError } from "./client.js";

export interface SecretFile {
  id: string;
  envId: string;
  secretPath: string;
  name: string;
  localPath?: string | null;
  description?: string | null;
  sha256: string;
  sizeBytes: number;
  version?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface FileScope {
  projectId?: string;
  projectSlug?: string;
  environment: string;
  path?: string;
}

export interface FilesApi {
  upload(
    scope: FileScope & { name: string; sha256: string; localPath?: string; description?: string; content: Uint8Array }
  ): Promise<{ file: SecretFile }>;
  list(scope: FileScope): Promise<{ files: SecretFile[] }>;
  download(scope: Pick<FileScope, "projectId" | "projectSlug">, fileId: string): Promise<{ file: SecretFile; content: Uint8Array }>;
  remove(scope: Pick<FileScope, "projectId" | "projectSlug">, fileId: string): Promise<{ file: SecretFile }>;
}

const resolveProjectId = async (
  client: SanctumClient,
  scope: Pick<FileScope, "projectId" | "projectSlug">
): Promise<string> => {
  if (scope.projectId) return scope.projectId;
  if (!scope.projectSlug) throw new Error("projectId or projectSlug is required");
  const project = await client.get<{ id: string }>(
    `/api/v1/projects/slug/${encodeURIComponent(scope.projectSlug)}`
  );
  return project.id;
};

export const createFiles = (client: SanctumClient): FilesApi => ({
  upload: async ({ content, name, sha256, localPath, description, ...scope }) =>
    client.request<{ file: SecretFile }>(`/api/v3/files/${encodeURIComponent(name)}`, {
      method: "PUT",
      query: {
        projectId: await resolveProjectId(client, scope),
        environment: scope.environment,
        path: scope.path ?? "/",
        localPath,
        description,
        sha256
      } as Record<string, QueryValue>,
      // Blob type feeds the content-type header, which the server parses as raw bytes
      body: new Blob([content as unknown as Uint8Array<ArrayBuffer>], { type: "application/octet-stream" })
    }),

  list: async (scope) =>
    client.get<{ files: SecretFile[] }>("/api/v3/files", {
      query: {
        projectId: await resolveProjectId(client, scope),
        environment: scope.environment,
        path: scope.path ?? "/"
      } as Record<string, QueryValue>
    }),

  download: async (scope, fileId) => {
    const response = await client.requestRaw(`/api/v3/files/${fileId}/download`, {
      query: { projectId: await resolveProjectId(client, scope) } as Record<string, QueryValue>
    });
    const sha256 = response.headers.get("x-sanctum-file-sha256") ?? "";
    const disposition = response.headers.get("content-disposition") ?? "";
    const name = decodeURIComponent(disposition.match(/filename="?([^";]+)"?/)?.[1] ?? "");
    return {
      file: { sha256, name } as SecretFile,
      content: new Uint8Array(await response.arrayBuffer())
    };
  },

  remove: async (scope, fileId) =>
    client.del<{ file: SecretFile }>(`/api/v3/files/${fileId}`, {
      query: { projectId: await resolveProjectId(client, scope) } as Record<string, QueryValue>
    })
});

export const isFilesApiUnavailable = (err: unknown) =>
  err instanceof SanctumApiError && (err.status === 404 || err.status === 405);
