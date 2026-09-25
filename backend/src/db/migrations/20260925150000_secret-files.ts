import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretFile))) {
    await knex.schema.createTable(TableName.SecretFile, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("envId").notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      t.index("envId");

      t.string("secretPath").notNullable().defaultTo("/");
      t.string("name").notNullable();
      t.string("localPath").nullable();
      t.text("description").nullable();
      t.string("sha256", 64).notNullable();
      t.bigInteger("sizeBytes").notNullable();
      t.binary("encryptedContent").notNullable();
      t.integer("version").notNullable().defaultTo(1);

      t.unique(["envId", "secretPath", "name"], { indexName: "uidx_secret_files_env_path_name" });

      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.SecretFile);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.SecretFile);
  await knex.schema.dropTableIfExists(TableName.SecretFile);
}
