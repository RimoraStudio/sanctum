import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { TIdentityUaDALFactory } from "@app/services/identity-ua/identity-ua-dal";

import { AppConnection } from "../app-connection-enums";
import { ExternalSanctumConnectionMethod } from "./external-sanctum-connection-enums";
import {
  TExternalSanctumConnection,
  TExternalSanctumConnectionConfig
} from "./external-sanctum-connection-types";

export type TRemoteProject = {
  id: string;
  name: string;
  slug: string;
  environments: Array<{ id: string; name: string; slug: string }>;
};

export type TRemoteEnvironmentFolderTree = Record<
  string,
  { id: string; name: string; slug: string; folders: Array<{ id: string; name: string; path: string }> }
>;

export const getExternalSanctumConnectionListItem = () => {
  return {
    name: "Sanctum" as const,
    app: AppConnection.ExternalSanctum as const,
    methods: Object.values(ExternalSanctumConnectionMethod) as [
      ExternalSanctumConnectionMethod.MachineIdentityUniversalAuth
    ]
  };
};

export const getExternalSanctumAccessToken = async (credentials: {
  instanceUrl: string;
  machineIdentityClientId: string;
  machineIdentityClientSecret: string;
}): Promise<string> => {
  const { instanceUrl, machineIdentityClientId, machineIdentityClientSecret } = credentials;

  const { data } = await request.post<{ accessToken: string; expiresIn: number; tokenType: string }>(
    `${instanceUrl}/api/v1/auth/universal-auth/login`,
    {
      clientId: machineIdentityClientId,
      clientSecret: machineIdentityClientSecret
    }
  );

  return data.accessToken;
};

export const validateExternalSanctumConnectionCredentials = async (
  config: TExternalSanctumConnectionConfig,
  identityUaDAL: Pick<TIdentityUaDALFactory, "findOne">
) => {
  const { credentials: inputCredentials } = config;

  await blockLocalAndPrivateIpAddresses(inputCredentials.instanceUrl);

  const localIdentity = await identityUaDAL.findOne({
    clientId: inputCredentials.machineIdentityClientId
  });

  if (localIdentity) {
    throw new BadRequestError({
      message:
        "Cannot create an Sanctum connection targeting the same instance. Use a machine identity from a different Sanctum instance."
    });
  }

  try {
    await getExternalSanctumAccessToken(inputCredentials);
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }

  return inputCredentials;
};

const getAuthHeaders = async (connection: TExternalSanctumConnection) => {
  await blockLocalAndPrivateIpAddresses(connection.credentials.instanceUrl);
  const token = await getExternalSanctumAccessToken(connection.credentials);
  return { Authorization: `Bearer ${token}` };
};

const getBaseUrl = (connection: TExternalSanctumConnection) => connection.credentials.instanceUrl.replace(/\/$/, "");

export const listProjects = async (connection: TExternalSanctumConnection): Promise<TRemoteProject[]> => {
  const baseUrl = getBaseUrl(connection);
  const headers = await getAuthHeaders(connection);
  try {
    const { data } = await request.get<{
      projects: Array<{
        id: string;
        name: string;
        slug: string;
        environments?: Array<{ id: string; name: string; slug: string }>;
      }>;
    }>(`${baseUrl}/api/v1/projects`, { headers, params: { type: "secret-manager" } });
    return (data.projects ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      environments: p.environments ?? []
    }));
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list projects from remote Sanctum: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to list projects from remote Sanctum",
      error: error as Error
    });
  }
};

export const getEnvironmentFolderTree = async (
  connection: TExternalSanctumConnection,
  projectId: string
): Promise<TRemoteEnvironmentFolderTree> => {
  const baseUrl = getBaseUrl(connection);
  const headers = await getAuthHeaders(connection);
  try {
    const { data } = await request.get<TRemoteEnvironmentFolderTree>(
      `${baseUrl}/api/v1/projects/${projectId}/environment-folder-tree`,
      { headers }
    );
    return data ?? {};
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to get folder tree from remote Sanctum: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to get folder tree from remote Sanctum",
      error: error as Error
    });
  }
};
