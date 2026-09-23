import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { ExternalSanctumConnectionMethod } from "./external-sanctum-connection-enums";

export const ExternalSanctumConnectionMachineIdentityCredentialsSchema = z.object({
  instanceUrl: z
    .string()
    .trim()
    .url("Instance URL must be a valid URL")
    .min(1, "Instance URL is required")
    .max(512, "Instance URL cannot exceed 512 characters"),
  machineIdentityClientId: z
    .string()
    .trim()
    .uuid("Machine Identity Client ID must be a valid UUID")
    .min(1, "Machine Identity Client ID is required"),
  machineIdentityClientSecret: z
    .string()
    .trim()
    .min(1, "Machine Identity Client Secret is required")
    .max(512, "Machine Identity Client Secret cannot exceed 512 characters")
});

const BaseExternalSanctumConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.ExternalSanctum)
});

export const ExternalSanctumConnectionSchema = BaseExternalSanctumConnectionSchema.extend({
  method: z.literal(ExternalSanctumConnectionMethod.MachineIdentityUniversalAuth),
  credentials: ExternalSanctumConnectionMachineIdentityCredentialsSchema
});

export const SanitizedExternalSanctumConnectionSchema = z.discriminatedUnion("method", [
  BaseExternalSanctumConnectionSchema.extend({
    method: z.literal(ExternalSanctumConnectionMethod.MachineIdentityUniversalAuth),
    credentials: ExternalSanctumConnectionMachineIdentityCredentialsSchema.pick({
      instanceUrl: true,
      machineIdentityClientId: true
    })
  }).describe(
    JSON.stringify({
      title: `${APP_CONNECTION_NAME_MAP[AppConnection.ExternalSanctum]} (Machine Identity - Universal Auth)`
    })
  )
]);

export const ValidateExternalSanctumConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(ExternalSanctumConnectionMethod.MachineIdentityUniversalAuth)
      .describe(AppConnections.CREATE(AppConnection.ExternalSanctum).method),
    credentials: ExternalSanctumConnectionMachineIdentityCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.ExternalSanctum).credentials
    )
  })
]);

export const CreateExternalSanctumConnectionSchema = ValidateExternalSanctumConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.ExternalSanctum)
);

export const UpdateExternalSanctumConnectionSchema = z
  .object({
    credentials: ExternalSanctumConnectionMachineIdentityCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.ExternalSanctum).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.ExternalSanctum));

export const ExternalSanctumConnectionListItemSchema = z
  .object({
    name: z.literal("Sanctum"),
    app: z.literal(AppConnection.ExternalSanctum),
    methods: z.nativeEnum(ExternalSanctumConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.ExternalSanctum] }));
