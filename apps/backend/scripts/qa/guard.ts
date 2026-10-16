import { URL } from "node:url";

const approvedHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);

/** Refuse a QA data mutation before Prisma ever receives a connection. */
export function assertQaEnvironment(requirePassword = true): URL {
  if (process.env.QA_SEED_ENABLED !== "true") throw new Error("Refusing QA operation: QA_SEED_ENABLED=true is required");
  if (process.env.NODE_ENV === "production") throw new Error("Refusing QA operation in production");
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("Refusing QA operation: DATABASE_URL is required");
  let database: URL;
  try { database = new URL(value); } catch { throw new Error("Refusing QA operation: DATABASE_URL is invalid"); }
  if (!approvedHosts.has(database.hostname) || database.pathname.replace(/^\//, "") !== "ecom_local_qa") {
    throw new Error("Refusing QA operation: target must be the local ecom_local_qa database");
  }
  if (requirePassword && !process.env.QA_SEED_PASSWORD) throw new Error("Refusing QA seed: QA_SEED_PASSWORD is required");
  return database;
}
