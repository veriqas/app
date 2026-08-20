import { db } from "@/lib/db/client";
const TENANT = process.env.E2E_TENANT!;

async function main() {
  let org = await db.organisation.findFirst({ where: { tenantId: TENANT }, select: { id: true } });
  if (!org) org = await db.organisation.create({ data: { tenantId: TENANT, name: "Veriqas Demo Group", industry: "Financial Services" }, select: { id: true } });
  for (const name of ["Payments", "Identity & Access", "Core Banking"]) {
    const exists = await db.businessUnit.findFirst({ where: { organisationId: org.id, name }, select: { id: true } });
    if (!exists) await db.businessUnit.create({ data: { organisationId: org.id, name, description: `${name} engineering` } });
  }
  const units = await db.businessUnit.findMany({ where: { organisationId: org.id }, select: { id: true, name: true } });
  console.log("departments:", units.map(u => u.name).join(", "));

  // Attribute the existing scans so the demo shows real attribution.
  const jobs = await db.scanJob.findMany({ where: { tenantId: TENANT }, select: { id: true, ref: true, targets: true } });
  const payments = units.find(u => u.name === "Payments")!;
  const identity = units.find(u => u.name === "Identity & Access")!;
  for (const j of jobs) {
    const unit = j.ref.includes("PY") || j.ref.includes("JAVA") ? identity : payments;
    await db.scanJob.update({ where: { id: j.id }, data: { businessUnitId: unit.id } });
  }
  console.log(`attributed ${jobs.length} scan job(s)`);
}
main().then(() => process.exit(0)).catch(e => { console.error("ERR", e.message); process.exit(1); });
