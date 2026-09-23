import z from "zod";

import { TExternalSanctumConnection } from "@app/services/app-connection/external-sanctum";

import {
  CreateExternalSanctumSyncSchema,
  ExternalSanctumSyncListItemSchema,
  ExternalSanctumSyncSchema
} from "./external-sanctum-sync-schemas";

export type TExternalSanctumSyncListItem = z.infer<typeof ExternalSanctumSyncListItemSchema>;

export type TExternalSanctumSync = z.infer<typeof ExternalSanctumSyncSchema>;

export type TExternalSanctumSyncInput = z.infer<typeof CreateExternalSanctumSyncSchema>;

export type TExternalSanctumSyncWithCredentials = TExternalSanctumSync & {
  connection: TExternalSanctumConnection;
};
