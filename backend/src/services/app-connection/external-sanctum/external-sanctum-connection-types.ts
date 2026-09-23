import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateExternalSanctumConnectionSchema,
  ExternalSanctumConnectionSchema,
  ValidateExternalSanctumConnectionCredentialsSchema
} from "./external-sanctum-connection-schemas";

export type TExternalSanctumConnection = z.infer<typeof ExternalSanctumConnectionSchema>;

export type TExternalSanctumConnectionInput = z.infer<typeof CreateExternalSanctumConnectionSchema> & {
  app: AppConnection.ExternalSanctum;
};

export type TValidateExternalSanctumConnectionCredentialsSchema =
  typeof ValidateExternalSanctumConnectionCredentialsSchema;

export type TExternalSanctumConnectionConfig = DiscriminativePick<
  TExternalSanctumConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};
