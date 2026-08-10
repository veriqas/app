import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { config } from "dotenv";
config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool, { schema: "senqor" });
const db = new PrismaClient({ adapter });
const users = await db.user.findMany({ select: { email: true, isActive: true, passwordHash: true } });
for (const u of users) {
  console.log(u.email, u.isActive, u.passwordHash ? "has-hash" : "NO HASH");
}
await db.$disconnect();
await pool.end();
