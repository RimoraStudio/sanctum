/* eslint-disable no-console */
import { crypto } from "@app/lib/crypto/cryptography";
import { IPType } from "@app/lib/ip";
import { initLogger } from "@app/lib/logger";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { initDbConnection } from "./instance";
import { getMigrationEnvConfig, getMigrationHsmConfig } from "./migrations/utils/env-config";
import { getMigrationHsmService } from "./migrations/utils/services";
import {
  AccessScope,
  IdentityAuthMethod,
  OrgMembershipRole,
  OrgMembershipStatus,
  ProjectMembershipRole,
  TableName
} from "./schemas";

const IDENTITY_NAME = process.env.SEED_IDENTITY_NAME ?? "cli-dev";
const PROJECT_ROLE = (process.env.SEED_PROJECT_ROLE ?? "admin") as ProjectMembershipRole;
const ORG_SLUG = process.env.SEED_ORG_SLUG ?? "rimora-4ib2";

const main = async () => {
  initLogger();

  const dbConnectionUri = process.env.DB_CONNECTION_URI;
  if (!dbConnectionUri) throw new Error("DB_CONNECTION_URI is not set");

  const db = initDbConnection({ dbConnectionUri });

  try {
    const { hsmService } = await getMigrationHsmService({ envConfig: getMigrationHsmConfig() });
    await getMigrationEnvConfig(superAdminDALFactory(db), hsmService, kmsRootConfigDALFactory(db));

    const org = await db(TableName.Organization).where({ slug: ORG_SLUG }).first();
    if (!org) throw new Error(`Org '${ORG_SLUG}' not found`);

    const project = await db(TableName.Project)
      .where({ orgId: org.id })
      .orderByRaw("case when type = 'secret-manager' then 0 else 1 end, \"createdAt\"")
      .first();
    if (!project) throw new Error(`No project found in org '${ORG_SLUG}'`);

    const existingIdentity = await db(TableName.Identity).where({ name: IDENTITY_NAME, orgId: org.id }).first();
    if (existingIdentity) {
      console.log(`identity '${IDENTITY_NAME}' already exists [id=${existingIdentity.id}]`);
      return;
    }

    const [identity] = await db(TableName.Identity)
      .insert({ name: IDENTITY_NAME, orgId: org.id, authMethod: IdentityAuthMethod.UNIVERSAL_AUTH })
      .returning("*");

    const [orgMembership] = await db(TableName.Membership)
      .insert({
        scope: AccessScope.Organization,
        scopeOrgId: org.id,
        actorIdentityId: identity.id,
        isActive: true,
        status: OrgMembershipStatus.Accepted
      })
      .returning("*");
    await db(TableName.MembershipRole).insert({ membershipId: orgMembership.id, role: OrgMembershipRole.Admin });

    const [projectMembership] = await db(TableName.Membership)
      .insert({
        scope: AccessScope.Project,
        scopeOrgId: org.id,
        scopeProjectId: project.id,
        actorIdentityId: identity.id,
        isActive: true,
        status: OrgMembershipStatus.Accepted
      })
      .returning("*");
    await db(TableName.MembershipRole).insert({
      membershipId: projectMembership.id,
      role: PROJECT_ROLE
    });

    const clientId = crypto.nativeCrypto.randomUUID();
    const trustedIps = JSON.stringify([
      { ipAddress: "0.0.0.0", type: IPType.IPV4, prefix: 0 },
      { ipAddress: "::", type: IPType.IPV6, prefix: 0 }
    ]);
    const [identityUa] = await db(TableName.IdentityUniversalAuth)
      .insert({
        identityId: identity.id,
        clientId,
        accessTokenTTL: 7200,
        accessTokenMaxTTL: 2592000,
        accessTokenNumUsesLimit: 0,
        accessTokenPeriod: 0,
        clientSecretTrustedIps: trustedIps,
        accessTokenTrustedIps: trustedIps,
        lockoutEnabled: true,
        lockoutThreshold: 3,
        lockoutDurationSeconds: 300,
        lockoutCounterResetSeconds: 30
      })
      .returning("*");

    const clientSecret = crypto.randomBytes(32).toString("hex");
    const clientSecretHash = await crypto.hashing().createHash(clientSecret, 10);
    await db(TableName.IdentityUaClientSecret).insert({
      identityUAId: identityUa.id,
      description: "cli dev secret",
      clientSecretPrefix: clientSecret.slice(0, 4),
      clientSecretHash,
      clientSecretNumUses: 0,
      clientSecretNumUsesLimit: 0,
      clientSecretTTL: 0,
      isClientSecretRevoked: false
    });

    console.log(`created identity '${IDENTITY_NAME}' [id=${identity.id}] in org '${org.slug}'`);
    console.log(`project access: '${project.name}' [id=${project.id}] role=${PROJECT_ROLE}`);
    console.log(`clientId=${clientId}`);
    console.log(`clientSecret=${clientSecret}`);
  } finally {
    await db.destroy();
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
