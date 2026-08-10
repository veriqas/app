import "dotenv/config";
import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
  adapter() {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL ?? "",
      ssl: { rejectUnauthorized: false },
      options: "-c search_path=senqor",
    });
    return new PrismaPg(pool);
  },
});
