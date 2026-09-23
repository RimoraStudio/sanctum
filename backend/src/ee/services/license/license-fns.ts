import { Knex } from "knex";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { getConfig, TEnvConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { UserAliasType } from "@app/services/user-alias/user-alias-types";

import { LicenseType, TFeatureSet, TLicenseKeyConfig, TOfflineLicenseContents } from "./license-types";

export const isOfflineLicenseKey = (licenseKey: string): boolean => {
  try {
    const contents = JSON.parse(Buffer.from(licenseKey, "base64").toString("utf8")) as TOfflineLicenseContents;

    return "signature" in contents && "license" in contents;
  } catch (error) {
    return false;
  }
};

export const getLicenseKeyConfig = (
  config?: Pick<TEnvConfig, "LICENSE_KEY" | "LICENSE_KEY_OFFLINE">
): TLicenseKeyConfig => {
  const cfg = config || getConfig();

  if (!cfg) {
    return { isValid: false };
  }

  const licenseKey = cfg.LICENSE_KEY;

  if (licenseKey) {
    if (isOfflineLicenseKey(licenseKey)) {
      return { isValid: true, licenseKey, type: LicenseType.Offline };
    }

    return { isValid: true, licenseKey, type: LicenseType.Online };
  }

  const offlineLicenseKey = cfg.LICENSE_KEY_OFFLINE;

  // backwards compatibility
  if (offlineLicenseKey) {
    if (isOfflineLicenseKey(offlineLicenseKey)) {
      return { isValid: true, licenseKey: offlineLicenseKey, type: LicenseType.Offline };
    }

    return { isValid: false };
  }

  return { isValid: false };
};

// Self-hosted unlock: this instance ships with every EE flag enabled. Any new flag added to
// TFeatureSet upstream must default to true here unless it is a restriction (enforce*, fips) or a
// numeric limit (null/high value). fips stays false — it switches crypto providers and breaks
// non-FIPS builds.
export const getDefaultOnPremFeatures = (): TFeatureSet => ({
  _id: null,
  slug: "enterprise",
  tier: -1,
  workspaceLimit: null,
  workspacesUsed: 0,
  secretSyncLimit: null,
  maxInternalCas: null,
  maxPamAccounts: null,
  memberLimit: null,
  environmentLimit: null,
  environmentsUsed: 0,
  identityLimit: null,
  dynamicSecret: true,
  secretVersioning: true,
  pitRecovery: true,
  ipAllowlisting: true,
  rbac: true,
  githubOrgSync: true,
  customRateLimits: true,
  subOrganization: true,
  customAlerts: true,
  secretAccessInsights: true,
  auditLogs: true,
  auditLogsRetentionDays: 36500,
  auditLogStreams: true,
  auditLogStreamLimit: 1000,
  samlSSO: true,
  enforceGoogleSSO: true,
  hsm: true,
  oidcSSO: true,
  scim: true,
  ldap: true,
  groups: true,
  status: null,
  trial_end: null,
  has_used_trial: true,
  secretApproval: true,
  secretRotation: true,
  caCrl: true,
  instanceUserManagement: true,
  externalKms: true,
  rateLimits: {
    readLimit: 6000,
    writeLimit: 20000,
    secretsLimit: 4000
  },
  pkiEst: true,
  pkiAcme: true,
  pkiScep: true,
  pkiPqc: true,
  pkiCodeSigning: true,
  kmsPqc: true,
  enforceMfa: true,
  projectTemplates: true,
  kmip: true,
  gateway: true,
  gatewayPool: true,
  pamSlackNotifications: true,
  secretScanning: true,
  enterpriseSecretSyncs: true,
  enterpriseCertificateSyncs: true,
  enterpriseAppConnections: true,
  fips: false,
  eventSubscriptions: true,
  machineIdentityAuthTemplates: true,
  pkiLegacyTemplates: true,
  secretShareExternalBranding: true,
  honeyTokens: true,
  honeyTokenLimit: 1000,
  secretsBrokering: true,
  // product gating
  pam: true,
  certManager: true,
  secretsTemporaryAccess: true,
  enterprisePamAccount: true,
  crossProjectSecretSharing: true,
  secretsFolderRbac: true
});

export const getEnforcedIdentityLimit = (plan: TFeatureSet): number | null => {
  const isEnterpriseBypass = plan?.slug === "enterprise" && !plan?.enforceIdentityLimit;
  if (isEnterpriseBypass) return null;
  return plan?.identityLimit ?? null;
};

export const throwOnPlanSeatLimitReached = async ({
  licenseService,
  orgId,
  identityLimit,
  tx,
  aliasType
}: {
  licenseService: Pick<TLicenseServiceFactory, "getOrgSeatUsage">;
  orgId: string;
  identityLimit: number | null;
  tx: Knex;
  aliasType?: UserAliasType;
}) => {
  if (!identityLimit) return;

  const { identitiesUsed } = await licenseService.getOrgSeatUsage(orgId, tx);
  if (identitiesUsed >= identityLimit) {
    // limit imposed on number of identities allowed / number of identities used exceeds the number of identities allowed
    throw new BadRequestError({
      message: `Failed to create new member${aliasType ? ` via ${aliasType.toUpperCase()}` : ""} due to member limit reached. Upgrade plan to add more members.`
    });
  }
};
