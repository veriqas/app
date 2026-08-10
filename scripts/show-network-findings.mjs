import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { config } from "dotenv";
config();

const db = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }), { schema: "senqor" }) });

const jobs = await db.scanJob.findMany({
  where: { sensor: { sensorType: { in: ["SSLYZE", "SSH_AUDIT"] } } },
  orderBy: { createdAt: "desc" },
  take: 2,
  include: { sensor: { select: { sensorType: true, name: true } } },
});

for (const job of jobs) {
  const obs = await db.cryptoObservation.findMany({ where: { scanJobId: job.id }, orderBy: { quantumClass: "asc" } });
  console.log(`\n╔═══ ${job.sensor.name} (${job.ref}) — ${job.targets.join(", ")} ═══`);
  for (const o of obs) {
    const risk = o.quantumClass === "QUANTUM_VULNERABLE" ? "🔴" : o.quantumClass === "QUANTUM_REDUCED_SECURITY" ? "🟡" : "🟢";
    const algo = (o.algorithm ?? o.algorithmRaw ?? "?").padEnd(22);
    const prim = (o.primitiveType ?? "").padEnd(24);
    const prov = o.provider ? ` [${o.provider}]` : "";
    console.log(`║ ${risk} ${algo} ${prim}${prov}`);
  }
}

await db.$disconnect();
