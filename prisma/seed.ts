/**
 * SENQOR POC Seed — Northstar Financial Group
 * Uses the same PrismaPg adapter as the app (schema: "senqor").
 * Safe to re-run (upsert-based).
 */

import { db } from "../src/lib/db/client.js";

const TENANT_ID = "cosQJN_Ve8kWzaYs";

async function main() {
  console.log("Seeding Northstar Financial Group POC data...");

  const firstUser = await db.user.findFirst({
    where: { tenantId: TENANT_ID, isActive: true },
    select: { id: true, email: true },
  });
  if (!firstUser) throw new Error("No user found for tenant");
  console.log(`Using owner: ${firstUser.email}`);

  // Business Services
  const bsData = [
    { ref: "BS-000001", name: "Retail Payments",         criticality: "CRITICAL", hndlRisk: "CRITICAL", dataCategories: ["Payment Data", "Customer Financial"] },
    { ref: "BS-000002", name: "Corporate Payments",      criticality: "CRITICAL", hndlRisk: "CRITICAL", dataCategories: ["Payment Data"] },
    { ref: "BS-000003", name: "Customer Identity",       criticality: "CRITICAL", hndlRisk: "HIGH",     dataCategories: ["Identity Records"] },
    { ref: "BS-000004", name: "Online Banking",          criticality: "CRITICAL", hndlRisk: "HIGH",     dataCategories: ["Customer Financial", "Identity Records"] },
    { ref: "BS-000005", name: "Treasury",                criticality: "CRITICAL", hndlRisk: "HIGH",     dataCategories: ["Payment Instructions"] },
    { ref: "BS-000006", name: "Payroll",                 criticality: "HIGH",     hndlRisk: "MEDIUM",   dataCategories: ["Employee Financial"] },
    { ref: "BS-000007", name: "Document Management",     criticality: "HIGH",     hndlRisk: "HIGH",     dataCategories: ["Signed Documents", "Contracts"] },
    { ref: "BS-000008", name: "Software Delivery",       criticality: "HIGH",     hndlRisk: "MEDIUM",   dataCategories: ["Source Code"] },
    { ref: "BS-000009", name: "Customer Communications", criticality: "MEDIUM",   hndlRisk: "LOW",      dataCategories: ["Customer Data"] },
  ] as const;
  for (const bs of bsData) {
    await db.businessService.upsert({
      where: { ref: bs.ref },
      update: { name: bs.name, criticality: bs.criticality, hndlRisk: bs.hndlRisk, dataCategories: [...bs.dataCategories] },
      create: { ref: bs.ref, tenantId: TENANT_ID, businessOwnerId: firstUser.id, name: bs.name, criticality: bs.criticality, hndlRisk: bs.hndlRisk, dataCategories: [...bs.dataCategories], status: "ACTIVE" },
    });
  }
  console.log(`Business services: ${bsData.length}`);

  // Suppliers
  const supplierData = [
    { ref: "SUP-000001", name: "Thales Group",      service: "HSM / Key Management",        criticality: "CRITICAL", dataAccess: ["Payment Keys", "Identity Records"],          qr: "DEVELOPING",   plan: "RECEIVED",      assessed: new Date("2026-04-10"), nextAssess: new Date("2026-10-10") },
    { ref: "SUP-000002", name: "Entrust",            service: "PKI / Certificate Lifecycle", criticality: "CRITICAL", dataAccess: ["Certificates"],                              qr: "ADEQUATE",     plan: "REVIEWED",      assessed: new Date("2026-03-15"), nextAssess: new Date("2026-09-15") },
    { ref: "SUP-000003", name: "IBM",                service: "Mainframe / Core Banking",    criticality: "CRITICAL", dataAccess: ["Customer Financial", "Payment Instructions"], qr: "ADEQUATE",     plan: "RECEIVED",      assessed: new Date("2026-01-20"), nextAssess: new Date("2026-07-20") },
    { ref: "SUP-000004", name: "SWIFT",              service: "Interbank Messaging",         criticality: "CRITICAL", dataAccess: ["Payment Instructions"],                      qr: "DEVELOPING",   plan: "RECEIVED",      assessed: new Date("2026-02-28"), nextAssess: new Date("2026-08-28") },
    { ref: "SUP-000005", name: "Finastra",           service: "Trade Finance Platform",      criticality: "CRITICAL", dataAccess: ["Payment Instructions", "Signed Contracts"],  qr: "POOR",         plan: "REQUESTED",     assessed: null,                   nextAssess: new Date("2026-07-31") },
    { ref: "SUP-000006", name: "Salesforce",         service: "CRM Platform",                criticality: "HIGH",     dataAccess: ["Identity Records"],                          qr: "DEVELOPING",   plan: "RECEIVED",      assessed: new Date("2026-05-01"), nextAssess: new Date("2026-11-01") },
    { ref: "SUP-000007", name: "Microsoft Azure",    service: "Cloud Infrastructure",        criticality: "CRITICAL", dataAccess: ["Customer Financial", "Source Code"],          qr: "ADEQUATE",     plan: "REVIEWED",      assessed: new Date("2026-06-01"), nextAssess: new Date("2026-12-01") },
    { ref: "SUP-000008", name: "Workday",            service: "HR & Payroll Platform",       criticality: "HIGH",     dataAccess: ["Employee Financial"],                        qr: "DEVELOPING",   plan: "NOT_REQUESTED", assessed: null,                   nextAssess: new Date("2026-09-30") },
    { ref: "SUP-000009", name: "Experian",           service: "Credit Risk Data",            criticality: "HIGH",     dataAccess: ["Identity Records", "Customer Financial"],    qr: "NOT_ASSESSED", plan: "NOT_REQUESTED", assessed: null,                   nextAssess: null },
    { ref: "SUP-000010", name: "Palo Alto Networks", service: "Network Security / Firewall", criticality: "HIGH",     dataAccess: [],                                            qr: "DEVELOPING",   plan: "RECEIVED",      assessed: new Date("2026-05-15"), nextAssess: new Date("2026-11-15") },
  ] as const;
  for (const s of supplierData) {
    await db.supplier.upsert({
      where: { ref: s.ref },
      update: { name: s.name, serviceProvided: s.service, criticality: s.criticality, dataAccess: [...s.dataAccess], quantumReadinessRating: s.qr, migrationPlanStatus: s.plan, lastAssessedAt: s.assessed, nextAssessmentAt: s.nextAssess },
      create: { ref: s.ref, tenantId: TENANT_ID, ownerId: firstUser.id, name: s.name, serviceProvided: s.service, criticality: s.criticality, dataAccess: [...s.dataAccess], dataLongevityRelevant: s.criticality === "CRITICAL", quantumReadinessRating: s.qr, migrationPlanStatus: s.plan, lastAssessedAt: s.assessed, nextAssessmentAt: s.nextAssess, status: "ACTIVE" },
    });
  }
  console.log(`Suppliers: ${supplierData.length}`);

  // Frameworks + Alignments
  const frameworkData = [
    { shortName: "NCSC PQC 2028", version: "2024", name: "NCSC Post-Quantum Cryptography Migration Guidance", issuingAuthority: "NCSC (UK)", jurisdiction: "United Kingdom", milestoneDate: new Date("2028-01-01"), isMandatory: true,  al: { alignedPct: 57, partialPct: 18, notAlignedPct: 18, notAssessedPct: 7,  evidenceCompleteness: 81, controlImplementation: 67, openGaps: 7,  confidence: "HIGH",   status: "PARTIALLY_ALIGNED", details: { gaps: ["Cryptographic inventory incomplete", "Critical suppliers not assessed", "No approved PQC migration roadmap", "Data longevity classification incomplete"] } } },
    { shortName: "NIST PQC",      version: "2024", name: "NIST Post-Quantum Migration Guidance",              issuingAuthority: "NIST (US)", jurisdiction: "United States",  milestoneDate: null,                   isMandatory: false, al: { alignedPct: 63, partialPct: 14, notAlignedPct: 16, notAssessedPct: 7,  evidenceCompleteness: 74, controlImplementation: 71, openGaps: 5,  confidence: "MEDIUM", status: "PARTIALLY_ALIGNED", details: { gaps: ["Algorithm inventory not complete", "PQC algorithm selection not formally approved", "Migration timeline not board-approved"] } } },
    { shortName: "CNSA 2.0",      version: "2022", name: "CNSA 2.0 Suite",                                    issuingAuthority: "NSA (US)",  jurisdiction: "United States",  milestoneDate: new Date("2030-01-01"), isMandatory: false, al: { alignedPct: 28, partialPct: 12, notAlignedPct: 47, notAssessedPct: 13, evidenceCompleteness: 41, controlImplementation: 33, openGaps: 14, confidence: "LOW",   status: "NOT_ALIGNED",        details: { gaps: ["ML-KEM not deployed in priority systems", "ML-DSA not deployed for signatures", "LMS not in use for software signing", "No CNSA 2.0 timeline approved"] } } },
  ] as const;
  for (const fw of frameworkData) {
    const framework = await db.framework.upsert({
      where: { tenantId_shortName_version: { tenantId: TENANT_ID, shortName: fw.shortName, version: fw.version } },
      update: { name: fw.name, issuingAuthority: fw.issuingAuthority, milestoneDate: fw.milestoneDate },
      create: { tenantId: TENANT_ID, name: fw.name, shortName: fw.shortName, version: fw.version, issuingAuthority: fw.issuingAuthority, jurisdiction: fw.jurisdiction, milestoneDate: fw.milestoneDate, isApplicable: true, isMandatory: fw.isMandatory },
    });
    const al = fw.al;
    const existing = await db.frameworkAlignment.findFirst({ where: { frameworkId: framework.id, tenantId: TENANT_ID } });
    if (existing) {
      await db.frameworkAlignment.update({ where: { id: existing.id }, data: { alignedPct: al.alignedPct, partialPct: al.partialPct, notAlignedPct: al.notAlignedPct, notAssessedPct: al.notAssessedPct, evidenceCompleteness: al.evidenceCompleteness, controlImplementation: al.controlImplementation, openGaps: al.openGaps, confidence: al.confidence, status: al.status, details: al.details, calculatedAt: new Date() } });
    } else {
      await db.frameworkAlignment.create({ data: { frameworkId: framework.id, tenantId: TENANT_ID, alignedPct: al.alignedPct, partialPct: al.partialPct, notAlignedPct: al.notAlignedPct, notAssessedPct: al.notAssessedPct, evidenceCompleteness: al.evidenceCompleteness, controlImplementation: al.controlImplementation, openGaps: al.openGaps, confidence: al.confidence, status: al.status, details: al.details } });
    }
  }
  console.log(`Frameworks: ${frameworkData.length}`);

  // Scoring Policy + ReadinessScore
  let policy = await db.scoringPolicy.findFirst({ where: { tenantId: TENANT_ID, isActive: true } });
  if (!policy) {
    policy = await db.scoringPolicy.create({ data: { tenantId: TENANT_ID, version: "1.0", isActive: true, description: "SENQOR default PQC readiness scoring policy", dimensions: { cryptoVisibility: { name: "Cryptographic Visibility", weight: 0.15 }, quantumExposure: { name: "Quantum Exposure", weight: 0.20 }, dataLongevity: { name: "Data Longevity Risk", weight: 0.15 }, migrationPrep: { name: "Migration Preparedness", weight: 0.20 }, thirdParty: { name: "Third-Party Readiness", weight: 0.10 }, governance: { name: "Governance Maturity", weight: 0.10 }, cryptoAgility: { name: "Cryptographic Agility", weight: 0.10 } } } });
  }

  const [riskCount, controlTests, cryptoAssets, obsCount] = await Promise.all([
    db.risk.count({ where: { tenantId: TENANT_ID, isActive: true } }),
    db.controlTest.findMany({ where: { tenantId: TENANT_ID }, select: { result: true } }),
    db.cryptoAsset.groupBy({ by: ["quantumClass"], where: { tenantId: TENANT_ID, isActive: true }, _count: true }),
    db.cryptoObservation.count({ where: { tenantId: TENANT_ID, isActive: true } }),
  ]);
  const totalAssets  = cryptoAssets.reduce((s, c) => s + c._count, 0);
  const vulnAssets   = cryptoAssets.find(c => c.quantumClass === "QUANTUM_VULNERABLE")?._count ?? 0;
  const pqAssets     = cryptoAssets.find(c => c.quantumClass === "POST_QUANTUM")?._count ?? 0;
  const passedTests  = controlTests.filter(t => t.result === "PASS").length;
  const totalTests   = controlTests.length;
  const assessedSups = supplierData.filter(s => s.assessed !== null).length;

  const visScore   = Math.min(100, obsCount > 0 ? 55 : 20);
  const exposScore = totalAssets > 0 ? Math.max(0, 100 - Math.round((vulnAssets/totalAssets)*100)) : 30;
  const longevScore = 45;
  const migScore   = totalTests > 0 ? Math.round((passedTests/totalTests)*100) : 25;
  const tpScore    = Math.round((assessedSups/supplierData.length)*100);
  const govScore   = riskCount > 0 ? 60 : 30;
  const agilScore  = pqAssets > 0 ? Math.min(80, 40+pqAssets) : 20;
  const overall    = Math.round(visScore*0.15 + exposScore*0.20 + longevScore*0.15 + migScore*0.20 + tpScore*0.10 + govScore*0.10 + agilScore*0.10);
  const rating     = overall >= 75 ? "LOW_EXPOSURE" : overall >= 50 ? "MODERATE_EXPOSURE" : overall >= 25 ? "HIGH_EXPOSURE" : "CRITICAL_EXPOSURE";
  const prevScore  = await db.readinessScore.findFirst({ where: { tenantId: TENANT_ID }, orderBy: { calculatedAt: "desc" } });

  await db.readinessScore.create({ data: { tenantId: TENANT_ID, scoringPolicyId: policy.id, overallScore: overall, overallRating: rating, previousScore: prevScore?.overallScore ?? null, scoreChange: prevScore ? overall - prevScore.overallScore : null, dimensions: { cryptoVisibility: visScore, quantumExposure: exposScore, dataLongevity: longevScore, migrationPrep: migScore, thirdParty: tpScore, governance: govScore, cryptoAgility: agilScore }, evidenceCoverage: 68, confidence: "MEDIUM" } });
  console.log(`ReadinessScore: ${overall} (${rating})`);

  // Actions
  const risks = await db.risk.findMany({ where: { tenantId: TENANT_ID, isActive: true }, select: { id: true }, orderBy: { residualRating: "asc" }, take: 8 });
  const actionData = [
    { ref: "ACT-000001", title: "Complete TLS endpoint discovery — Production perimeter",   type: "REMEDIATION", priority: "CRITICAL", status: "IN_PROGRESS",    days: 18  },
    { ref: "ACT-000002", title: "Issue PQC questionnaire to critical suppliers",            type: "GOVERNANCE",  priority: "CRITICAL", status: "OPEN",           days: 33  },
    { ref: "ACT-000003", title: "Classify long-life information assets for HNDL risk",     type: "GOVERNANCE",  priority: "CRITICAL", status: "ASSIGNED",       days: 12  },
    { ref: "ACT-000004", title: "Draft and approve PQC Migration Policy",                  type: "GOVERNANCE",  priority: "HIGH",     status: "PENDING_EVIDENCE", days: 19 },
    { ref: "ACT-000005", title: "Assign cryptographic asset owners — unowned inventory",   type: "GOVERNANCE",  priority: "HIGH",     status: "IN_PROGRESS",    days: 48  },
    { ref: "ACT-000006", title: "Deploy hybrid key establishment — Payment Gateway",       type: "REMEDIATION", priority: "HIGH",     status: "OPEN",           days: 79  },
    { ref: "ACT-000007", title: "Migrate Corporate PKI to ML-DSA hierarchy",              type: "REMEDIATION", priority: "HIGH",     status: "OPEN",           days: 261 },
    { ref: "ACT-000008", title: "SSH key algorithm migration — Production fleet",          type: "REMEDIATION", priority: "MEDIUM",   status: "OPEN",           days: 140 },
    { ref: "ACT-000009", title: "Board presentation — Quantum Risk Posture Q3",           type: "GOVERNANCE",  priority: "HIGH",     status: "ASSIGNED",       days: 50  },
    { ref: "ACT-000010", title: "NCSC PQC 2028 — Gap analysis and remediation plan",      type: "GOVERNANCE",  priority: "HIGH",     status: "IN_PROGRESS",    days: 49  },
  ] as const;
  for (let i = 0; i < actionData.length; i++) {
    const a = actionData[i];
    const due = new Date(); due.setDate(due.getDate() + a.days);
    const existing = await db.action.findFirst({ where: { ref: a.ref, tenantId: TENANT_ID } });
    if (!existing) {
      const action = await db.action.create({ data: { ref: a.ref, tenantId: TENANT_ID, ownerId: firstUser.id, title: a.title, actionType: a.type, priority: a.priority as any, status: a.status, dueDate: due } });
      const riskId = risks[i]?.id;
      if (riskId) await db.actionEntity.create({ data: { actionId: action.id, entityType: "RISK", riskId } });
    }
  }
  console.log(`Actions: ${actionData.length}`);

  // Evidence
  const scanJobs = await db.scanJob.findMany({ where: { tenantId: TENANT_ID, status: "COMPLETED" }, select: { id: true, ref: true, sensor: { select: { sensorType: true } } }, take: 5 });
  const staticEvidence = [
    { ref: "EVD-000001", title: "Board Risk Committee — Quantum Readiness Briefing", type: "DOCUMENT",    source: "Board Office", method: "MANUAL",    state: "VERIFIED",  collectedAt: new Date("2026-06-15"), expiresAt: new Date("2027-06-15"), verifiedAt: new Date("2026-06-16") },
    { ref: "EVD-000002", title: "Supplier Attestation — Entrust PQC Roadmap",        type: "ATTESTATION", source: "Entrust",      method: "MANUAL",    state: "VERIFIED",  collectedAt: new Date("2026-03-10"), expiresAt: new Date("2027-03-10"), verifiedAt: new Date("2026-03-15") },
    { ref: "EVD-000003", title: "PQC Policy — Board Approval Evidence",              type: "DOCUMENT",    source: "Policy Team",  method: "MANUAL",    state: "MISSING",   collectedAt: null,                   expiresAt: null,                   verifiedAt: null },
    { ref: "EVD-000004", title: "Supplier Questionnaire — Finastra",                 type: "DOCUMENT",    source: "Finastra",     method: "MANUAL",    state: "MISSING",   collectedAt: null,                   expiresAt: null,                   verifiedAt: null },
    { ref: "EVD-000005", title: "Risk Assessment — Payment Gateway HNDL",            type: "DOCUMENT",    source: "Risk Team",    method: "MANUAL",    state: "EXPIRED",   collectedAt: new Date("2026-05-10"), expiresAt: new Date("2026-06-10"), verifiedAt: new Date("2026-05-11") },
  ] as const;
  const scanEvidence = scanJobs.map((j, i) => ({ ref: `EVD-SC${String(i+1).padStart(3,"0")}`, title: `${j.sensor.sensorType} Scan — ${j.ref}`, type: "SCAN_RESULT", source: j.sensor.sensorType, method: "AUTOMATED", state: "VERIFIED" as const, collectedAt: new Date(), expiresAt: new Date(Date.now()+90*86400000), verifiedAt: new Date() }));
  const allEvidence = [...staticEvidence, ...scanEvidence];
  for (const ev of allEvidence) {
    const existing = await db.evidence.findFirst({ where: { ref: ev.ref, tenantId: TENANT_ID } });
    if (!existing) await db.evidence.create({ data: { ref: ev.ref, tenantId: TENANT_ID, title: ev.title, evidenceType: ev.type, sourceSystem: ev.source, collectionMethod: ev.method, verificationState: ev.state as any, collectedAt: ev.collectedAt ?? new Date(), expiresAt: ev.expiresAt, verifiedAt: ev.verifiedAt } });
  }
  console.log(`Evidence: ${allEvidence.length}`);

  // Programme
  const prog = await db.programme.findFirst({ where: { tenantId: TENANT_ID } });
  if (!prog) {
    const programme = await db.programme.create({ data: { ref: "PROG-000001", tenantId: TENANT_ID, title: "PQC Migration Programme 2026-2028", description: "Enterprise-wide migration to post-quantum cryptography aligned to NCSC guidance", programmeType: "PQC_MIGRATION", ownerId: firstUser.id, targetReadiness: 80, status: "IN_PROGRESS", progress: 18, startDate: new Date("2026-01-01"), targetDate: new Date("2028-01-01") } });
    for (const ph of [
      { order: 1, name: "Discovery & Inventory",  status: "COMPLETED",   startDate: new Date("2026-01-01"), targetDate: new Date("2026-03-31"), projectedScore: 35 },
      { order: 2, name: "Risk Assessment",         status: "IN_PROGRESS", startDate: new Date("2026-04-01"), targetDate: new Date("2026-06-30"), projectedScore: 48 },
      { order: 3, name: "Migration Planning",      status: "PLANNED",     startDate: new Date("2026-07-01"), targetDate: new Date("2026-09-30"), projectedScore: 58 },
      { order: 4, name: "Pilot Deployments",       status: "PLANNED",     startDate: new Date("2026-10-01"), targetDate: new Date("2027-03-31"), projectedScore: 70 },
      { order: 5, name: "Full Migration",          status: "PLANNED",     startDate: new Date("2027-04-01"), targetDate: new Date("2028-01-01"), projectedScore: 85 },
    ]) await db.programmePhase.create({ data: { ...ph, programmeId: programme.id } });
    console.log("Programme + 5 phases");
  }

  console.log("\nSeed complete.");
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
