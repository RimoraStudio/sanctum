import { TOrgPermission } from "@app/lib/types";
import { TEntitlementsResponse } from "@app/services/license-client/license-client-types";

export enum InstanceType {
  OnPrem = "self-hosted",
  // Self-hosted online license: features are resolved from License Server v2.
  EnterpriseOnPrem = "enterprise-self-hosted",
  EnterpriseOnPremOffline = "enterprise-self-hosted-offline",
  Cloud = "cloud"
}

export type TOfflineLicenseContents = {
  license: TOfflineLicense;
  signature: string;
};

export type TOfflineLicense = {
  issuedTo: string;
  licenseId: string;
  customerId: string | null;
  issuedAt: string;
  expiresAt: string | null;
  terminatesAt: string | null;
  // v1 (or absent) offline licenses carry the legacy feature-flag set directly; version 2 licenses
  // carry License Server v2 entitlements, which we project into the same feature shape.
  version?: number;
  features: TFeatureSet;
  entitlements?: TEntitlementsResponse;
};

export type TOrgSeatUsage = {
  membersUsed: number;
  identitiesUsed: number;
};

export type TFeatureSet = {
  _id: string | null;
  slug: string | null;
  // True when features are sourced from an offline (air-gapped) license; the billing UI renders a
  // read-only offline banner instead of the live billing surface.
  isOffline?: boolean;
  tier: number;
  workspaceLimit: number | null;
  workspacesUsed: number;
  dynamicSecret: boolean;
  memberLimit: number | null;
  identityLimit: number | null;
  enforceIdentityLimit?: boolean;
  subOrganization: boolean;
  environmentLimit: number | null;
  environmentsUsed: number;
  secretVersioning: boolean;
  pitRecovery: boolean;
  ipAllowlisting: boolean;
  rbac: boolean;
  customRateLimits: boolean;
  customAlerts: boolean;
  auditLogs: boolean;
  auditLogsRetentionDays: number;
  auditLogStreams: boolean;
  auditLogStreamLimit: number;
  githubOrgSync: boolean;
  samlSSO: boolean;
  enforceGoogleSSO: boolean;
  hsm: boolean;
  oidcSSO: boolean;
  secretAccessInsights: boolean;
  scim: boolean;
  ldap: boolean;
  groups: boolean;
  status: string | null;
  trial_end: string | null;
  has_used_trial: boolean;
  secretApproval: boolean;
  secretRotation: boolean;
  caCrl: boolean;
  instanceUserManagement: boolean;
  externalKms: boolean;
  rateLimits: {
    readLimit: number;
    writeLimit: number;
    secretsLimit: number;
  };
  pkiEst: boolean;
  pkiAcme: boolean;
  pkiScep: boolean;
  pkiPqc: boolean;
  // PKI code signing capability. null (default) is ignored (no restriction); an explicit boolean gates
  // code signer creation.
  pkiCodeSigning: boolean | null;
  kmsPqc: boolean;
  enforceMfa: boolean;
  projectTemplates: boolean;
  kmip: boolean;
  gateway: boolean;
  gatewayPool: boolean;
  pamSlackNotifications: boolean;
  secretScanning: boolean;
  enterpriseSecretSyncs: boolean;
  enterpriseCertificateSyncs: boolean;
  enterpriseAppConnections: boolean;
  machineIdentityAuthTemplates: boolean;
  pkiLegacyTemplates: boolean;
  fips: boolean;
  eventSubscriptions: boolean;
  secretShareExternalBranding: boolean;
  honeyTokens: boolean;
  honeyTokenLimit: number;
  secretsBrokering: boolean;
  secretSyncLimit: number | null;
  maxInternalCas: number | null;
  maxPamAccounts: number | null;
  pam: boolean | null;
  certManager: boolean | null;
  secretsTemporaryAccess: boolean | null;
  enterprisePamAccount: boolean | null;
  crossProjectSecretSharing: boolean;
  secretsFolderRbac: boolean;
};

export type TOrgPlanDTO = {
  projectId?: string;
  refreshCache?: boolean;
  rootOrgId: string;
} & TOrgPermission;

export enum LicenseType {
  Offline = "offline",
  // Self-hosted online license key; resolves entitlements from License Server v2.
  Online = "online"
}

export type TLicenseKeyConfig =
  | {
      isValid: false;
    }
  | {
      isValid: true;
      licenseKey: string;
      type: LicenseType;
    };
