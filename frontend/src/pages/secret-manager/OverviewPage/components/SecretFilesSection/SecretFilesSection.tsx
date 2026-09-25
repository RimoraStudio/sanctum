import { subject } from "@casl/ability";
import { useQueries } from "@tanstack/react-query";
import { DownloadIcon, FileIcon, Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Card,
  CardContent,
  CardHeader,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import {
  fetchSecretFiles,
  secretFileKeys,
  TSecretFile,
  useDeleteSecretFile,
  useDownloadSecretFile
} from "@app/hooks/api/secretFiles";

type Props = {
  projectId: string;
  secretPath: string;
  visibleEnvs: { slug: string; name?: string }[];
};

const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

export const SecretFilesSection = ({ projectId, secretPath, visibleEnvs }: Props) => {
  const { permission } = useProjectPermission();
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteFile"
  ] as const);

  const queries = useQueries({
    queries: visibleEnvs.map((env) => ({
      queryKey: secretFileKeys.list({ projectId, environment: env.slug, secretPath }),
      queryFn: () => fetchSecretFiles({ projectId, environment: env.slug, secretPath }),
      retry: (failureCount: number, error: { response?: { status?: number } }) =>
        error.response?.status !== 404 && failureCount < 1,
      enabled: Boolean(projectId)
    }))
  });

  const files = queries.flatMap((q, i) =>
    (q.data ?? []).map((f) => ({ ...f, envSlug: visibleEnvs[i].slug }))
  );
  const allErrored = queries.every((q) => q.isError);

  const { mutateAsync: downloadFile } = useDownloadSecretFile();
  const { mutateAsync: deleteFile } = useDeleteSecretFile();

  if (allErrored || files.length === 0) return null;

  const canRead = (file: TSecretFile & { envSlug: string }) =>
    permission.can(
      ProjectPermissionSecretActions.ReadValue,
      subject(ProjectPermissionSub.Secrets, {
        environment: file.envSlug,
        secretPath,
        secretName: file.name,
        secretTags: ["*"]
      })
    );

  const onDownload = async (file: TSecretFile & { envSlug: string }) => {
    try {
      await downloadFile({ projectId, file });
    } catch {
      createNotification({ type: "error", text: "Failed to download file" });
    }
  };

  const onDelete = async (file: TSecretFile & { envSlug: string }) => {
    try {
      await deleteFile({
        projectId,
        fileId: file.id,
        environment: file.envSlug,
        secretPath
      });
      createNotification({ type: "success", text: `Deleted ${file.name}` });
    } catch {
      createNotification({ type: "error", text: "Failed to delete file" });
    } finally {
      handlePopUpClose("deleteFile");
    }
  };

  const pendingDelete = popUp.deleteFile.data as (TSecretFile & { envSlug: string }) | undefined;

  return (
    <>
      <Card className="mt-4">
        <CardHeader className="flex-row items-center gap-2 py-3">
          <FileIcon className="h-4 w-4 text-mineshaft-300" />
          <span className="text-sm font-medium">Files</span>
          <span className="text-xs text-mineshaft-400">{files.length}</span>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Name</TableHead>
                <TableHead>Restore path</TableHead>
                <TableHead>Env</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>SHA-256</TableHead>
                <TableHead>Version</TableHead>
                <TableHead className="w-20 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => (
                <TableRow key={file.id}>
                  <TableCell className="pl-5 font-medium">{file.name}</TableCell>
                  <TableCell className="text-mineshaft-300">
                    <code>{file.localPath ?? "-"}</code>
                  </TableCell>
                  <TableCell>{file.envSlug}</TableCell>
                  <TableCell>{formatBytes(file.sizeBytes)}</TableCell>
                  <TableCell>
                    <code className="text-mineshaft-300">{file.sha256.slice(0, 12)}</code>
                  </TableCell>
                  <TableCell>{file.version ?? 1}</TableCell>
                  <TableCell className="pr-5 text-right">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <IconButton
                            aria-label={`Download ${file.name}`}
                            variant="ghost"
                            size="sm"
                            isDisabled={!canRead(file)}
                            onClick={() => onDownload(file)}
                          >
                            <DownloadIcon className="h-4 w-4" />
                          </IconButton>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {canRead(file)
                          ? "Download"
                          : "You do not have access to file values"}
                      </TooltipContent>
                    </Tooltip>
                    <ProjectPermissionCan
                      I={ProjectPermissionSecretActions.Delete}
                      a={subject(ProjectPermissionSub.Secrets, {
                        environment: file.envSlug,
                        secretPath,
                        secretName: file.name,
                        secretTags: ["*"]
                      })}
                    >
                      <IconButton
                        aria-label={`Delete ${file.name}`}
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePopUpOpen("deleteFile", file)}
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </IconButton>
                    </ProjectPermissionCan>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <DeleteActionModal
        isOpen={popUp.deleteFile.isOpen}
        onChange={(isOpen) => handlePopUpToggle("deleteFile", isOpen)}
        deleteKey={pendingDelete?.name ?? ""}
        title="Delete file"
        onDeleteApproved={async () => {
          if (pendingDelete) await onDelete(pendingDelete);
        }}
      />
    </>
  );
};
