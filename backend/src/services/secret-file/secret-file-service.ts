import { createHash } from "crypto";

import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType, TSecretFiles } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { isValidSecretPath } from "@app/lib/validator";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";

import { TKmsServiceFactory } from "../kms/kms-service";
import { TSecretFileDALFactory } from "./secret-file-dal";
import {
  TDeleteSecretFileDTO,
  TDownloadSecretFileDTO,
  TListSecretFilesDTO,
  TUploadSecretFileDTO
} from "./secret-file-types";

type TSecretFileServiceFactoryDep = {
  secretFileDAL: TSecretFileDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "encryptWithRootKey" | "decryptWithRootKey">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
};

export type TSecretFileServiceFactory = ReturnType<typeof secretFileServiceFactory>;

const MAX_FILE_BYTES = 32 * 1024 * 1024;

// pg returns int8 as string; normalize so API output is a JSON number
const toDto = ({ encryptedContent, sizeBytes, ...f }: TSecretFiles) => ({
  ...f,
  sizeBytes: Number(sizeBytes)
});

export const secretFileServiceFactory = ({
  secretFileDAL,
  permissionService,
  kmsService,
  projectEnvDAL
}: TSecretFileServiceFactoryDep) => {
  const getPermission = async ({ actor, actorId, actorAuthMethod, actorOrgId, projectId }: {
    actor: TUploadSecretFileDTO["actor"];
    actorId: string;
    actorAuthMethod: TUploadSecretFileDTO["actorAuthMethod"];
    actorOrgId: string;
    projectId: string;
  }) =>
    permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

  const resolveEnv = async (projectId: string, environment: string) => {
    const env = await projectEnvDAL.findOne({ projectId, slug: environment });
    if (!env) {
      throw new NotFoundError({
        message: `Environment with slug '${environment}' not found`
      });
    }
    return env;
  };

  const upload = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    environment,
    secretPath,
    name,
    localPath,
    description,
    sha256,
    content
  }: TUploadSecretFileDTO) => {
    if (!content.length) throw new BadRequestError({ message: "File content is empty" });
    if (content.length > MAX_FILE_BYTES)
      throw new BadRequestError({
        message: `File exceeds the ${MAX_FILE_BYTES / 1024 / 1024} MB size limit`
      });
    if (!isValidSecretPath(secretPath))
      throw new BadRequestError({ message: "Invalid secret path." });
    // eslint-disable-next-line no-control-regex
    const hasControlChars = (s: string) => /[\u0000-\u001f\u007f]/.test(s);
    if (
      name.includes("/") ||
      name.includes("\\") ||
      name.includes("..") ||
      name !== name.trim() ||
      hasControlChars(name)
    )
      throw new BadRequestError({ message: "Invalid file name." });
    if (localPath !== undefined && localPath !== null) {
      const segments = localPath.split(/[/\\]/);
      if (
        segments.includes("..") ||
        /^[A-Za-z]:|^[/\\]/.test(localPath) ||
        hasControlChars(localPath)
      )
        throw new BadRequestError({ message: "localPath must be a relative path inside the project." });
    }
    const digest = createHash("sha256").update(content).digest("hex");
    if (digest !== sha256)
      throw new BadRequestError({ message: "sha256 does not match the uploaded content." });

    const { permission } = await getPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });

    const existing = await (async () => {
      const env = await resolveEnv(projectId, environment);
      const file = await secretFileDAL.findOneByScope({ envId: env.id, secretPath, name });
      return { env, file };
    })();

    ForbiddenError.from(permission).throwUnlessCan(
      existing.file ? ProjectPermissionSecretActions.Edit : ProjectPermissionSecretActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    const encryptedContent = kmsService.encryptWithRootKey()(content);

    const file = existing.file
      ? await secretFileDAL.updateById(existing.file.id, {
          encryptedContent,
          sha256,
          sizeBytes: content.length,
          localPath: localPath ?? existing.file.localPath,
          description: description ?? existing.file.description,
          version: (existing.file.version ?? 1) + 1
        })
      : await secretFileDAL.create({
          envId: existing.env.id,
          secretPath,
          name,
          localPath,
          description,
          sha256,
          sizeBytes: content.length,
          encryptedContent
        });

    return toDto(file);
  };

  const list = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    environment,
    secretPath
  }: TListSecretFilesDTO) => {
    const { permission } = await getPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.DescribeSecret,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    const env = await resolveEnv(projectId, environment);
    const files = await secretFileDAL.findByEnvAndPath({ envId: env.id, secretPath });
    return files.map((f) => toDto(f as TSecretFiles));
  };

  const download = async ({ actor, actorId, actorAuthMethod, actorOrgId, projectId, fileId }: TDownloadSecretFileDTO) => {
    const file = await secretFileDAL.findById(fileId);
    if (!file) throw new NotFoundError({ message: "File not found" });

    const env = await projectEnvDAL.findOne({ id: file.envId });
    if (!env || env.projectId !== projectId) throw new NotFoundError({ message: "File not found" });

    const { permission } = await getPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.ReadValue,
      subject(ProjectPermissionSub.Secrets, { environment: env.slug, secretPath: file.secretPath })
    );

    const content = kmsService.decryptWithRootKey()(file.encryptedContent as Buffer);
    return { file: toDto(file), content };
  };

  const deleteFile = async ({ actor, actorId, actorAuthMethod, actorOrgId, projectId, fileId }: TDeleteSecretFileDTO) => {
    const file = await secretFileDAL.findById(fileId);
    if (!file) throw new NotFoundError({ message: "File not found" });

    const env = await projectEnvDAL.findOne({ id: file.envId });
    if (!env || env.projectId !== projectId) throw new NotFoundError({ message: "File not found" });

    const { permission } = await getPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.Delete,
      subject(ProjectPermissionSub.Secrets, { environment: env.slug, secretPath: file.secretPath })
    );

    await secretFileDAL.deleteById(fileId);
    return toDto(file);
  };

  return { upload, list, download, deleteFile };
};
