import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  getEnvironmentFolderTree as getRemoteEnvironmentFolderTree,
  listProjects as listRemoteProjects,
  TRemoteEnvironmentFolderTree,
  TRemoteProject
} from "./external-sanctum-connection-fns";
import { TExternalSanctumConnection } from "./external-sanctum-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TExternalSanctumConnection>;

export const externalSanctumConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, actor: OrgServiceActor): Promise<TRemoteProject[]> => {
    const appConnection = await getAppConnection(AppConnection.ExternalSanctum, connectionId, actor);
    return listRemoteProjects(appConnection);
  };

  const getEnvironmentFolderTree = async (
    connectionId: string,
    projectId: string,
    actor: OrgServiceActor
  ): Promise<TRemoteEnvironmentFolderTree> => {
    const appConnection = await getAppConnection(AppConnection.ExternalSanctum, connectionId, actor);
    return getRemoteEnvironmentFolderTree(appConnection, projectId);
  };

  return {
    listProjects,
    getEnvironmentFolderTree
  };
};
