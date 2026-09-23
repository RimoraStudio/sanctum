import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

const ExternalSanctumSyncDestinationConfigSchema = z.object({
  projectId: z
    .string()
    .trim()
    .min(1, "Project ID is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.EXTERNAL_SANCTUM.projectId),
  environment: z
    .string()
    .trim()
    .min(1, "Environment slug is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.EXTERNAL_SANCTUM.environment),
  secretPath: z
    .string()
    .trim()
    .min(1, "Secret path is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.EXTERNAL_SANCTUM.secretPath)
});

const ExternalSanctumSyncOptionsConfig: TSyncOptionsConfig = {
  canImportSecrets: true,
  canRemoveSecretsOnDeletion: true,
  supportsKeySchema: false
};

export const ExternalSanctumSyncSchema = BaseSecretSyncSchema(
  SecretSync.ExternalSanctum,
  ExternalSanctumSyncOptionsConfig
)
  .extend({
    destination: z.literal(SecretSync.ExternalSanctum),
    destinationConfig: ExternalSanctumSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.ExternalSanctum] }));

export const CreateExternalSanctumSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.ExternalSanctum,
  ExternalSanctumSyncOptionsConfig,
  z.object({})
).extend({
  destinationConfig: ExternalSanctumSyncDestinationConfigSchema
});

export const UpdateExternalSanctumSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.ExternalSanctum,
  ExternalSanctumSyncOptionsConfig,
  z.object({})
).extend({
  destinationConfig: ExternalSanctumSyncDestinationConfigSchema.optional()
});

export const ExternalSanctumSyncListItemSchema = z
  .object({
    name: z.literal("Sanctum"),
    connection: z.literal(AppConnection.ExternalSanctum),
    destination: z.literal(SecretSync.ExternalSanctum),
    canImportSecrets: z.literal(true),
    canRemoveSecretsOnDeletion: z.literal(true),
    supportsKeySchema: z.literal(false)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.ExternalSanctum] }));
