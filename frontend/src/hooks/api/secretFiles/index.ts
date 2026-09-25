import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

export type TSecretFile = {
  id: string;
  name: string;
  secretPath: string;
  envId: string;
  localPath?: string | null;
  description?: string | null;
  sha256: string;
  sizeBytes: number;
  version?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type TGetSecretFilesDTO = {
  projectId: string;
  environment: string;
  secretPath?: string;
};

export const secretFileKeys = {
  list: (dto: TGetSecretFilesDTO) => ["secret-files", dto] as const
};

export const fetchSecretFiles = async (dto: TGetSecretFilesDTO) => {
  const { data } = await apiRequest.get<{ files: TSecretFile[] }>("/api/v3/files", {
    params: { projectId: dto.projectId, environment: dto.environment, path: dto.secretPath }
  });
  return data.files;
};

export const useGetSecretFiles = (dto: TGetSecretFilesDTO, enabled = true) =>
  useQuery({
    queryKey: secretFileKeys.list(dto),
    queryFn: () => fetchSecretFiles(dto),
    enabled: enabled && Boolean(dto.projectId),
    // missing endpoint means the backend predates blob storage; not an error worth surfacing
    retry: (failureCount, error: { response?: { status?: number } }) =>
      error.response?.status !== 404 && failureCount < 1
  });

export const useDownloadSecretFile = () =>
  useMutation<void, object, { projectId: string; file: TSecretFile }>({
    mutationFn: async ({ projectId, file }) => {
      const response = await apiRequest.get(`/api/v3/files/${file.id}/download`, {
        params: { projectId },
        responseType: "arraybuffer"
      });
      const blob = new Blob([response.data], { type: "application/octet-stream" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }
  });

export const useDeleteSecretFile = () => {
  const queryClient = useQueryClient();
  return useMutation<
    { file: TSecretFile },
    object,
    { projectId: string; fileId: string; environment: string; secretPath: string }
  >({
    mutationFn: async ({ projectId, fileId }) => {
      const { data } = await apiRequest.delete<{ file: TSecretFile }>(`/api/v3/files/${fileId}`, {
        params: { projectId }
      });
      return data;
    },
    onSuccess: (_data, { projectId, environment, secretPath }) => {
      queryClient.invalidateQueries({
        queryKey: secretFileKeys.list({ projectId, environment, secretPath })
      });
    }
  });
};
