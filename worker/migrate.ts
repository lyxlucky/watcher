import { database } from "./db.ts";
import { fileURLToPath } from "node:url";

const sql = database();
try {
  await sql.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(193841)`;
    await transaction.file(fileURLToPath(new URL("./schema.sql", import.meta.url)));
  });
  console.log("数据库迁移完成");
} finally {
  await sql.end();
}
