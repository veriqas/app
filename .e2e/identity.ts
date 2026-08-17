/** Item 4: canonical algorithm identity across languages. */
import { db } from "@/lib/db/client";
const TENANT = process.env.E2E_TENANT!;

async function main() {
  console.log("=== 4a. DETECTED IDENTITY (same primitive, three parsers) ===");
  const obs = await db.cryptoObservation.findMany({
    where: { tenantId: TENANT, sensorType: { in: ["CRYPTOSCAN_AST", "CRYPTOSCAN_AST_PY", "CRYPTOSCAN_AST_JAVA"] }, algorithm: "MD5" },
    select: { sensorType: true, algorithm: true, primitiveType: true, quantumClass: true, purpose: true, filePath: true, lineNumber: true, confidence: true, evidenceSource: true },
    orderBy: { sensorType: "asc" },
  });
  for (const o of obs) {
    console.log(`  ${o.sensorType.padEnd(20)} ${String(o.algorithm).padEnd(6)} ${String(o.primitiveType).padEnd(6)} ${o.quantumClass.padEnd(20)} conf=${o.confidence} src=${o.evidenceSource} ${o.filePath}:${o.lineNumber}`);
  }
  const distinct = (k: keyof (typeof obs)[number]) => [...new Set(obs.map(o => String(o[k])))];
  console.log("  distinct algorithm  :", distinct("algorithm").join(","));
  console.log("  distinct primitive  :", distinct("primitiveType").join(","));
  console.log("  distinct quantumClass:", distinct("quantumClass").join(","));
  console.log("  distinct confidence :", distinct("confidence").join(","));
  console.log("  IDENTITY CONSISTENT :", distinct("algorithm").length === 1 && distinct("primitiveType").length === 1 && distinct("quantumClass").length === 1);

  console.log("\n=== 4b. POST-PATCH IDENTITY (AI-introduced primitive, re-scanned) ===");
  const vf = await db.verificationFinding.findMany({
    where: { run: { tenantId: TENANT }, phase: "AFTER" },
    select: { scanner: true, algorithm: true, normalizedLocation: true, fingerprint: true },
    distinct: ["scanner", "algorithm"],
    orderBy: { scanner: "asc" },
  });
  for (const f of vf) console.log(`  ${f.scanner.padEnd(20)} ${String(f.algorithm).padEnd(12)} ${f.normalizedLocation}`);
  const hmac = vf.filter(f => String(f.algorithm).startsWith("HMAC"));
  console.log("  HMAC canonical names across languages:", [...new Set(hmac.map(f => f.algorithm))].join(",") || "(none)");
}
main().then(() => process.exit(0)).catch(e => { console.error("ERR", e.message); process.exit(1); });
