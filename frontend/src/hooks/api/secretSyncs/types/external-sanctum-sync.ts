import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TExternalSanctumSync = TRootSecretSync & {
  destination: SecretSync.ExternalSanctum;
  destinationConfig: {
    projectId: string;
    environment: string;
    secretPath: string;
  };
  connection: {
    app: AppConnection.ExternalSanctum;
    name: string;
    id: string;
  };
};
