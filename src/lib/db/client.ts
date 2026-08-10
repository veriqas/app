import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  // Strip ?schema= from the connection string — pg driver doesn't use it.
  // PrismaPg's { schema } option is the correct way to tell Prisma which schema to use.
  const rawUrl = process.env.DATABASE_URL ?? "";
  const connStr = rawUrl.replace(/[?&]schema=[^&]*/g, "").replace(/[?&]$/, "");

  // Disable SSL when DATABASE_SSL=false or connecting to local/Docker host
  const sslDisabled = process.env.DATABASE_SSL === "false" ||
    /[@/](db|localhost|127\.0\.0\.1)(:|\/|$)/.test(connStr);
  const sslConfig = sslDisabled ? false : { rejectUnauthorized: false };

  const pool = new pg.Pool({
    connectionString: connStr,
    ssl: sslConfig,
  });

  // { schema: "senqor" } makes PrismaPg generate senqor.TableName SQL — definitive fix.
  const adapter = new PrismaPg(pool, { schema: "senqor" });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
