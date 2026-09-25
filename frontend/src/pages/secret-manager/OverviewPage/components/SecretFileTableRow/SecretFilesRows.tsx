import { subject } from "@casl/ability";
import { useQueries } from "@tanstack/react-query";
import { DownloadIcon, FileIcon, Trash2Icon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  IconButton,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import {
  fetchSecretFiles,
  secretFileKeys,
  TSecretFile,
  useDeleteSecretFile,
  useDownloadSecretFile
} from "@app/hooks/api/secretFiles";

import { ResourceEnvironmentStatusCell } from "../ResourceEnvironmentStatusCell";

type RowProps = {
  projectId: string;
  fileName: string;
  secretPath: string;
  environments: { slug: string; name?: string }[];
  getFileByName: (envSlug: string, name: string) => TSecretFile | undefined;
  onDelete: (file: TSecretFile) => void;
};

const SecretFileTableRow = ({
  projectId,
  fileName,
  secretPath,
  environments,
  getFileByName,
  onDelete
}: RowProps) => {
  const { mutateAsync: downloadFile } = useDownloadSecretFile();
  const isSingleEnvView = environments.length === 1;
  const singleEnvFile = isSingleEnvView ? getFileByName(environments[0].slug, fileName) : undefined;

  const fileSubject = (file: TSecretFile, envSlug: string) =>
    subject(ProjectPermissionSub.Secrets, {
      environment: envSlug,
      secretPath,
      secretName: file.name,
      secretTags: ["*"]
    });

  const onDownload = async (file: TSecretFile) => {
    try {
      await downloadFile({ projectId, file });
    } catch {
      createNotification({ type: "error", text: "Failed to download file" });
    }
  };

  return (
    <TableRow className="group hover:z-10">
      <TableCell
        className={twMerge(
          !isSingleEnvView && "sticky left-0 z-10",
          "bg-container transition-colors duration-75 group-hover:bg-container-hover"
        )}
      >
        <FileIcon className="text-secret" />
      </TableCell>
      <TableCell
        isTruncatable
        colSpan={isSingleEnvView ? 2 : undefined}
        className={twMerge(
          !isSingleEnvView && "sticky left-10 z-10 border-r",
          "bg-container transition-colors duration-75 group-hover:bg-container-hover"
        )}
      >
        {isSingleEnvView && singleEnvFile ? (
          <div className="relative flex w-full items-center">
            <span className="truncate">{fileName}</span>
            <span className="mx-2.5 text-xs text-muted">
              {singleEnvFile.sizeBytes < 1024 * 1024
                ? `${(singleEnvFile.sizeBytes / 1024).toFixed(1)} KB`
                : `${(singleEnvFile.sizeBytes / 1024 / 1024).toFixed(2)} MB`}
            </span>
            <div className="absolute top-1/2 -right-2.5 z-20 -translate-y-1/2">
              <div className="flex items-center rounded-md border border-border bg-container-hover px-0.5 py-0.5 opacity-0 shadow-md transition-all duration-300 group-hover:opacity-100">
                <Tooltip disableHoverableContent>
                  <TooltipTrigger>
                    <ProjectPermissionCan
                      I={ProjectPermissionSecretActions.ReadValue}
                      a={fileSubject(singleEnvFile, environments[0].slug)}
                    >
                      {(isAllowed) => (
                        <IconButton
                          variant="ghost"
                          size="xs"
                          isDisabled={!isAllowed}
                          onClick={(e) => {
                            e.stopPropagation();
                            void onDownload(singleEnvFile);
                          }}
                          className="w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7"
                        >
                          <DownloadIcon />
                        </IconButton>
                      )}
                    </ProjectPermissionCan>
                  </TooltipTrigger>
                  <TooltipContent>Download file</TooltipContent>
                </Tooltip>
                <Tooltip disableHoverableContent>
                  <TooltipTrigger>
                    <ProjectPermissionCan
                      I={ProjectPermissionSecretActions.Delete}
                      a={fileSubject(singleEnvFile, environments[0].slug)}
                    >
                      {(isAllowed) => (
                        <IconButton
                          variant="ghost"
                          size="xs"
                          isDisabled={!isAllowed}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(singleEnvFile);
                          }}
                          className="w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7 hover:text-danger"
                        >
                          <Trash2Icon />
                        </IconButton>
                      )}
                    </ProjectPermissionCan>
                  </TooltipTrigger>
                  <TooltipContent>Delete file</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        ) : (
          <>
            {fileName}
            {(() => {
              const envIdx = environments.findIndex(({ slug }) => getFileByName(slug, fileName));
              const target = envIdx >= 0 ? getFileByName(environments[envIdx].slug, fileName)! : undefined;
              if (!target) return null;
              return (
                <div
                  className={twMerge(
                    "absolute z-20 top-1/2 right-[3px] -translate-y-1/2",
                    "flex items-center rounded-md border border-border bg-container-hover px-0.5 py-0.5 shadow-md",
                    "pointer-events-none opacity-0 transition-all duration-300",
                    "group-hover:pointer-events-auto group-hover:gap-1 group-hover:opacity-100"
                  )}
                >
                  <Tooltip disableHoverableContent>
                    <TooltipTrigger>
                      <ProjectPermissionCan
                        I={ProjectPermissionSecretActions.ReadValue}
                        a={fileSubject(target, environments[envIdx].slug)}
                      >
                        {(isAllowed) => (
                          <IconButton
                            variant="ghost"
                            size="xs"
                            isDisabled={!isAllowed}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void onDownload(target);
                            }}
                            className="w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7"
                          >
                            <DownloadIcon />
                          </IconButton>
                        )}
                      </ProjectPermissionCan>
                    </TooltipTrigger>
                    <TooltipContent>Download ({environments[envIdx].slug})</TooltipContent>
                  </Tooltip>
                  <Tooltip disableHoverableContent>
                    <TooltipTrigger>
                      <ProjectPermissionCan
                        I={ProjectPermissionSecretActions.Delete}
                        a={fileSubject(target, environments[envIdx].slug)}
                      >
                        {(isAllowed) => (
                          <IconButton
                            variant="ghost"
                            size="xs"
                            isDisabled={!isAllowed}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(target);
                            }}
                            className="w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7 hover:text-danger"
                          >
                            <Trash2Icon />
                          </IconButton>
                        )}
                      </ProjectPermissionCan>
                    </TooltipTrigger>
                    <TooltipContent>Delete ({environments[envIdx].slug})</TooltipContent>
                  </Tooltip>
                </div>
              );
            })()}
          </>
        )}
      </TableCell>
      {environments.length > 1 &&
        environments.map(({ slug }, i) => (
          <ResourceEnvironmentStatusCell
            key={`file-overview-${slug}-${i + 1}`}
            status={getFileByName(slug, fileName) ? "present" : "missing"}
          />
        ))}
    </TableRow>
  );
};

type Props = {
  projectId: string;
  secretPath: string;
  visibleEnvs: { slug: string; name?: string; id?: string }[];
};

export const SecretFilesRows = ({ projectId, secretPath, visibleEnvs }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteFile"
  ] as const);
  const { mutateAsync: deleteFile } = useDeleteSecretFile();

  const queries = useQueries({
    queries: visibleEnvs.map((env) => ({
      queryKey: secretFileKeys.list({ projectId, environment: env.slug, secretPath }),
      queryFn: () => fetchSecretFiles({ projectId, environment: env.slug, secretPath }),
      // missing endpoint means the backend predates the file store; show nothing
      retry: (failureCount: number, error: { response?: { status?: number } }) =>
        error.response?.status !== 404 && failureCount < 1,
      enabled: Boolean(projectId)
    }))
  });

  const names = new Set<string>();
  const fileIndex = new Map<string, TSecretFile>();
  queries.forEach((q, i) => {
    q.data?.forEach((f) => {
      names.add(f.name);
      fileIndex.set(`${visibleEnvs[i].slug}:${f.name}`, f);
    });
  });
  const fileNames = [...names].sort((a, b) => a.localeCompare(b));

  const getFileByName = (envSlug: string, name: string) => fileIndex.get(`${envSlug}:${name}`);

  if (fileNames.length === 0) return null;

  const pendingDelete = popUp.deleteFile.data as TSecretFile | undefined;

  return (
    <>
      {fileNames.map((name) => (
        <SecretFileTableRow
          key={`file-overview-${name}`}
          projectId={projectId}
          fileName={name}
          secretPath={secretPath}
          environments={visibleEnvs}
          getFileByName={getFileByName}
          onDelete={(file) => handlePopUpOpen("deleteFile", file)}
        />
      ))}
      <DeleteActionModal
        isOpen={popUp.deleteFile.isOpen}
        onChange={(isOpen) => handlePopUpToggle("deleteFile", isOpen)}
        deleteKey={pendingDelete?.name ?? ""}
        title="Delete file"
        onDeleteApproved={async () => {
          if (!pendingDelete) return;
          try {
            await deleteFile({
              projectId,
              fileId: pendingDelete.id,
              environment:
                visibleEnvs.find((e) => e.id === pendingDelete.envId)?.slug ?? "",
              secretPath
            });
            createNotification({ type: "success", text: `Deleted ${pendingDelete.name}` });
          } catch {
            createNotification({ type: "error", text: "Failed to delete file" });
          } finally {
            handlePopUpClose("deleteFile");
          }
        }}
      />
    </>
  );
};
