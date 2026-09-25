import { TProjectPermission } from "@app/lib/types";

export type TSecretFileScope = {
  environment: string;
  secretPath: string;
};

export type TUploadSecretFileDTO = TProjectPermission &
  TSecretFileScope & {
    name: string;
    localPath?: string;
    description?: string;
    sha256: string;
    content: Buffer;
  };

export type TListSecretFilesDTO = TProjectPermission & {
  environment: string;
  secretPath?: string;
};

export type TDownloadSecretFileDTO = TProjectPermission & { fileId: string };

export type TDeleteSecretFileDTO = TProjectPermission & { fileId: string };
