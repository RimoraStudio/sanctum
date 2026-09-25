import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSecretFileDALFactory = ReturnType<typeof secretFileDALFactory>;

export const secretFileDALFactory = (db: TDbClient) => {
  const secretFileOrm = ormify(db, TableName.SecretFile);

  const findOneByScope = async (
    { envId, secretPath, name }: { envId: string; secretPath: string; name: string },
    tx?: Knex
  ) =>
    (tx || db.replicaNode())(TableName.SecretFile)
      .where({ envId, secretPath, name })
      .select("*")
      .first();

  const publicColumns = [
    "id",
    "envId",
    "secretPath",
    "name",
    "localPath",
    "description",
    "sha256",
    "sizeBytes",
    "version",
    "createdAt",
    "updatedAt"
  ];

  const findByEnvAndPath = async ({ envId, secretPath }: { envId: string; secretPath: string }, tx?: Knex) =>
    (tx || db.replicaNode())(TableName.SecretFile)
      .where({ envId, secretPath })
      .select(publicColumns)
      .orderBy("name", "asc");

  const findByEnv = async ({ envId }: { envId: string }, tx?: Knex) =>
    (tx || db.replicaNode())(TableName.SecretFile)
      .where({ envId })
      .select(publicColumns)
      .orderBy(["secretPath", "name"]);

  return { ...secretFileOrm, findOneByScope, findByEnvAndPath, findByEnv };
};
