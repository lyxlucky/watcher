import postgres from "postgres";

let connection: ReturnType<typeof postgres> | undefined;

export function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 未配置");
  return connection ??= postgres(url, {
    max: 8,
    idle_timeout: 20,
    connect_timeout: 5,
    prepare: false,
    connection: { statement_timeout: 8000 },
  });
}

export type Transaction = postgres.TransactionSql;
