import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum ExternalSanctumConnectionMethod {
  MachineIdentityUniversalAuth = "machine-identity-universal-auth"
}

export type TExternalSanctumConnection = TRootAppConnection & {
  app: AppConnection.ExternalSanctum;
} & {
  method: ExternalSanctumConnectionMethod.MachineIdentityUniversalAuth;
  credentials: {
    instanceUrl: string;
    machineIdentityClientId: string;
  };
};
