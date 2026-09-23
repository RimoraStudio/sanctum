import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const EXTERNAL_SANCTUM_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Sanctum",
  destination: SecretSync.ExternalSanctum,
  connection: AppConnection.ExternalSanctum,
  canImportSecrets: true,
  canRemoveSecretsOnDeletion: true,
  supportsKeySchema: false
};
