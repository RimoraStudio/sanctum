import {
  CreateExternalSanctumSyncSchema,
  ExternalSanctumSyncSchema,
  TExternalSanctumSync,
  TExternalSanctumSyncInput,
  UpdateExternalSanctumSyncSchema
} from "@app/services/secret-sync/external-sanctum";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerExternalSanctumSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints<TExternalSanctumSync, TExternalSanctumSyncInput>({
    destination: SecretSync.ExternalSanctum,
    server,
    responseSchema: ExternalSanctumSyncSchema,
    createSchema: CreateExternalSanctumSyncSchema,
    updateSchema: UpdateExternalSanctumSyncSchema
  });
