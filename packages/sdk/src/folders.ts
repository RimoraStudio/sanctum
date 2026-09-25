import type { QueryValue, SanctumClient } from "./client.js";
import { SanctumApiError } from "./client.js";

export interface Folder {
  id: string;
  name: string;
  envId: string;
  version: number;
  parentId?: string | null;
  isReserved: boolean;
  description?: string | null;
  relativePath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FolderScope {
  projectId?: string;
  projectSlug?: string;
  environment: string;
  path?: string;
}

export interface FoldersApi {
  list(scope: FolderScope): Promise<{ folders: Folder[] }>;
  create(scope: FolderScope & { name: string }): Promise<{ folder: Folder }>;
  /** Create every missing segment of `scope.path`; existing folders are left alone. */
  ensurePath(scope: FolderScope): Promise<void>;
}

const resolveProjectId = async (client: SanctumClient, scope: FolderScope): Promise<string> => {
  if (scope.projectId) return scope.projectId;
  if (!scope.projectSlug) throw new Error("projectId or projectSlug is required");
  const project = await client.get<{ id: string }>(
    `/api/v1/projects/slug/${encodeURIComponent(scope.projectSlug)}`
  );
  return project.id;
};

export const createFolders = (client: SanctumClient): FoldersApi => ({
  list: async (scope) =>
    client.get<{ folders: Folder[] }>("/api/v2/folders", {
      query: {
        projectId: await resolveProjectId(client, scope),
        environment: scope.environment,
        path: scope.path ?? "/"
      } as Record<string, QueryValue>
    }),

  create: async ({ name, ...scope }) => {
    const projectId = await resolveProjectId(client, scope);
    return client.post<{ folder: Folder }>("/api/v2/folders", {
      projectId,
      environment: scope.environment,
      name,
      path: scope.path ?? "/"
    });
  },

  ensurePath: async (scope) => {
    const segments = (scope.path ?? "/").split("/").filter(Boolean);
    if (!segments.length) return;

    const projectId = await resolveProjectId(client, scope);
    let parent = "/";
    for (const name of segments) {
      try {
        await client.post("/api/v2/folders", {
          projectId,
          environment: scope.environment,
          name,
          path: parent
        });
      } catch (err) {
        if (!(err instanceof SanctumApiError) || !/already exists/i.test(err.message)) throw err;
      }
      parent = parent === "/" ? `/${name}` : `${parent}/${name}`;
    }
  }
});
