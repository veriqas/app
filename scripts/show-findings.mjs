import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { config } from "dotenv";
config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool, { schema: "senqor" }) });

// Get the two most recent scan jobs
const jobs = await db.scanJob.findMany({
  orderBy: { createdAt: "desc" },
  take: 2,
  include: { sensor: { select: { sensorType: true, name: true } } },
});

for (const job of jobs) {
  const obs = await db.cryptoObservation.findMany({
    where: { scanJobId: job.id },
    orderBy: { quantumClass: "asc" },
  });

  console.log(`\n╔═══ ${job.sensor.name} (${job.sensor.sensorType}) ═══`);
  console.log(`║ Job: ${job.ref} | Status: ${job.status} | Observations: ${obs.length}`);
  console.log("╠" + "═".repeat(60));
  for (const o of obs) {
    const risk = o.quantumClass === "QUANTUM_VULNERABLE" ? "🔴 VULNERABLE" :
                 o.quantumClass === "QUANTUM_REDUCED_SECURITY" ? "🟡 REDUCED"  : "🟢 SAFE";
    console.log(`║ ${risk.padEnd(18)} ${String(o.algorithm ?? o.algorithmRaw).padEnd(20)} ${o.primitiveType ?? ""}`);
    if (o.filePath)     console.log(`║   File: ${o.filePath}:${o.lineNumber ?? ""}`);
    if (o.packageName)  console.log(`║   Pkg:  ${o.packageName} ${o.packageVersion ?? ""}`);
    if (o.provider)     console.log(`║   Lib:  ${o.provider}`);
  }
}

await db.$disconnect();
await pool.end();
