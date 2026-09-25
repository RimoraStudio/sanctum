import { useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { subject } from "@casl/ability";
import { useQueryClient } from "@tanstack/react-query";
import { DownloadIcon, FileIcon, Trash2Icon, UploadIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, PageHeader } from "@app/components/v2";
import {
  Button,
  Card,
  CardContent,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
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
import { apiRequest } from "@app/config/request";
import {
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import {
  TSecretFile,
  useDeleteSecretFile,
  useDownloadSecretFile,
  useGetSecretFiles
} from "@app/hooks/api/secretFiles";
import { withProjectPermission } from "@app/hoc";
import { ProjectType } from "@app/hooks/api/projects/types";

const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

const sha256Hex = async (bytes: ArrayBuffer) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

export const FilesPage = withProjectPermission(
  () => {
    const { currentProject, projectId } = useProject();
    const { permission } = useProjectPermission();
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
      "deleteFile"
    ] as const);

    const environments = currentProject?.environments ?? [];
    const [environment, setEnvironment] = useState("");
    const [pathFilter, setPathFilter] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const env = environments.find((e) => e.slug === environment) ?? environments[0];

    const { data: files, isPending, isError } = useGetSecretFiles(
      { projectId, environment: env?.slug ?? "" },
      Boolean(projectId && env?.slug)
    );

    const filtered = useMemo(() => {
      const q = pathFilter.trim().toLowerCase();
      if (!q) return files ?? [];
      return (files ?? []).filter(
        (f) =>
          f.secretPath.toLowerCase().includes(q) ||
          f.name.toLowerCase().includes(q) ||
          (f.localPath ?? "").toLowerCase().includes(q)
      );
    }, [files, pathFilter]);

    const { mutateAsync: downloadFile } = useDownloadSecretFile();
    const { mutateAsync: deleteFile } = useDeleteSecretFile();

    const secretSubject = (file: TSecretFile) =>
      subject(ProjectPermissionSub.Secrets, {
        environment: env?.slug ?? "",
        secretPath: file.secretPath,
        secretName: file.name,
        secretTags: ["*"]
      });

    const canDownload = (file: TSecretFile) =>
      permission.can(ProjectPermissionSecretActions.ReadValue, secretSubject(file));

    const canUpload = env
      ? permission.can(
          ProjectPermissionSecretActions.Create,
          subject(ProjectPermissionSub.Secrets, {
            environment: env.slug,
            secretPath: pathFilter.trim() || "/",
            secretName: "*",
            secretTags: ["*"]
          })
        )
      : false;

    const handleUpload = async (picked: File) => {
      if (!env) return;
      setIsUploading(true);
      try {
        const bytes = await picked.arrayBuffer();
        const sha256 = await sha256Hex(bytes);
        await apiRequest.put(`/api/v3/files/${encodeURIComponent(picked.name)}`, bytes, {
          headers: { "content-type": "application/octet-stream" },
          params: {
            projectId,
            environment: env.slug,
            path: pathFilter.trim() || "/",
            sha256
          }
        });
        await queryClient.invalidateQueries({ queryKey: ["secret-files"] });
        createNotification({ type: "success", text: `Uploaded ${picked.name}` });
      } catch {
        createNotification({ type: "error", text: "Failed to upload file" });
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };

    const pendingDelete = popUp.deleteFile.data as TSecretFile | undefined;

    return (
      <div className="h-full">
        <Helmet>
          <title>Files | Sanctum</title>
        </Helmet>
        <PageHeader
          scope={ProjectType.SecretManager}
          title="Files"
          description="Binary secrets stored encrypted at rest. Managed by the sanctum CLI or uploaded here."
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) void handleUpload(picked);
            }}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            isDisabled={!canUpload || isUploading}
            isPending={isUploading}
          >
            <UploadIcon className="mr-2 h-4 w-4" />
            Upload file
          </Button>
        </PageHeader>
        <div className="mb-4 flex gap-2">
          <Select value={env?.slug ?? ""} onValueChange={setEnvironment}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Environment" />
            </SelectTrigger>
            <SelectContent>
              {environments.map((e) => (
                <SelectItem key={e.slug} value={e.slug}>
                  {e.name ?? e.slug}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Filter by name or path"
            className="w-64"
            value={pathFilter}
            onChange={(e) => setPathFilter(e.target.value)}
          />
        </div>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Name</TableHead>
                  <TableHead>Vault path</TableHead>
                  <TableHead>Restore path</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>SHA-256</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead className="w-20 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending &&
                  [0, 1, 2].map((i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                {isError && (
                  <TableRow>
                    <TableCell colSpan={7} className="pl-5 text-mineshaft-300">
                      Failed to load files. The file store may not be available on this instance.
                    </TableCell>
                  </TableRow>
                )}
                {!isPending && !isError && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="pl-5 text-mineshaft-300">
                      <div className="flex items-center gap-2 py-6">
                        <FileIcon className="h-4 w-4" />
                        No files here yet. Push one with `sanctum files push &lt;file&gt;` or upload
                        above.
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell className="pl-5 font-medium">{file.name}</TableCell>
                    <TableCell>
                      <code className="text-mineshaft-300">{file.secretPath}</code>
                    </TableCell>
                    <TableCell>
                      <code className="text-mineshaft-300">{file.localPath ?? "-"}</code>
                    </TableCell>
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
                              isDisabled={!canDownload(file)}
                              onClick={async () => {
                                try {
                                  await downloadFile({ projectId, file });
                                } catch {
                                  createNotification({
                                    type: "error",
                                    text: "Failed to download file"
                                  });
                                }
                              }}
                            >
                              <DownloadIcon className="h-4 w-4" />
                            </IconButton>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {canDownload(file) ? "Download" : "You do not have access to file values"}
                        </TooltipContent>
                      </Tooltip>
                      <ProjectPermissionCan
                        I={ProjectPermissionSecretActions.Delete}
                        a={secretSubject(file)}
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
            if (!pendingDelete || !env) return;
            try {
              await deleteFile({
                projectId,
                fileId: pendingDelete.id,
                environment: env.slug,
                secretPath: pendingDelete.secretPath
              });
              createNotification({ type: "success", text: `Deleted ${pendingDelete.name}` });
            } catch {
              createNotification({ type: "error", text: "Failed to delete file" });
            } finally {
              handlePopUpClose("deleteFile");
            }
          }}
        />
      </div>
    );
  },
  {
    action: ProjectPermissionSecretActions.DescribeSecret,
    subject: ProjectPermissionSub.Secrets
  }
);
