import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { TRemoteSanctumEnvironmentFolderTree, TRemoteSanctumProject } from "./types";

const externalSanctumConnectionKeys = {
  all: [...appConnectionKeys.all, "external-sanctum"] as const,
  listProjects: (connectionId: string) =>
    [...externalSanctumConnectionKeys.all, "projects", connectionId] as const,
  getEnvironmentFolderTree: (connectionId: string, projectId: string) =>
    [
      ...externalSanctumConnectionKeys.all,
      "environment-folder-tree",
      connectionId,
      projectId
    ] as const
};

export const useExternalSanctumConnectionListProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TRemoteSanctumProject[],
      unknown,
      TRemoteSanctumProject[],
      ReturnType<typeof externalSanctumConnectionKeys.listProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: externalSanctumConnectionKeys.listProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ projects: TRemoteSanctumProject[] }>(
        `/api/v1/app-connections/external-sanctum/${connectionId}/projects`
      );
      return data.projects;
    },
    ...options
  });
};

export const useExternalSanctumConnectionGetEnvironmentFolderTree = (
  connectionId: string,
  projectId: string,
  options?: Omit<
    UseQueryOptions<
      TRemoteSanctumEnvironmentFolderTree,
      unknown,
      TRemoteSanctumEnvironmentFolderTree,
      ReturnType<typeof externalSanctumConnectionKeys.getEnvironmentFolderTree>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: externalSanctumConnectionKeys.getEnvironmentFolderTree(connectionId, projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TRemoteSanctumEnvironmentFolderTree>(
        `/api/v1/app-connections/external-sanctum/${connectionId}/projects/${projectId}/environment-folder-tree`
      );
      return data ?? {};
    },
    ...options
  });
};
