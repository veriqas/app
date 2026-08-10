/**
 * Quantum Risk & Compliance — PDF Report
 * Built with @react-pdf/renderer (runs server-side, no headless browser).
 */
/* eslint-disable @next/next/no-img-element */
import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

// â"€â"€ Palette â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const C = {
  navy:    "#0C1524",
  cyan:    "#f8781e",
  white:   "#FFFFFF",
  slate:   "#4A5568",
  muted:   "#8A95A3",
  border:  "#E8ECF0",
  bg:      "#F7F9FC",
  red:     "#EF4444",
  orange:  "#F97316",
  amber:   "#F59E0B",
  green:   "#10B981",
  ink:     "#0F1923",
};

// â"€â"€ Styles â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    backgroundColor: C.white,
    paddingTop: 0,
    paddingBottom: 40,
    paddingHorizontal: 0,
    fontSize: 9,
    color: C.ink,
  },

  // Cover header band
  coverBand: {
    backgroundColor: C.navy,
    paddingHorizontal: 40,
    paddingTop: 36,
    paddingBottom: 28,
  },
  coverProduct: {
    fontSize: 9,
    color: C.cyan,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  coverTitle: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    letterSpacing: -0.5,
  },
  coverMeta: {
    fontSize: 8,
    color: "rgba(255,255,255,0.45)",
    marginTop: 6,
  },

  // Body container
  body: {
    paddingHorizontal: 40,
    paddingTop: 28,
  },

  // Section header
  sectionLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 8,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    borderBottomStyle: "solid",
  },

  // KPI row
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  kpiCard: {
    flex: 1,
    backgroundColor: C.bg,
    borderRadius: 6,
    padding: 10,
  },
  kpiLabel: { fontSize: 7, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 },
  kpiValue: { fontSize: 18, fontFamily: "Helvetica-Bold", color: C.cyan, lineHeight: 1 },
  kpiSub:   { fontSize: 7, color: C.muted, marginTop: 3 },

  // Risk table
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.navy,
    borderRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    borderBottomStyle: "solid",
  },
  tableRowAlt: { backgroundColor: C.bg },
  colRef:    { width: 70, fontSize: 7 },
  colTitle:  { flex: 1, fontSize: 8 },
  colRating: { width: 56, fontSize: 8, textAlign: "center" },
  colStatus: { width: 72, fontSize: 8, textAlign: "right" },
  th: { color: C.white, fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },

  // Severity pill colours (text only in PDF)
  criticalText: { color: C.red,    fontFamily: "Helvetica-Bold" },
  highText:     { color: C.orange, fontFamily: "Helvetica-Bold" },
  mediumText:   { color: C.amber,  fontFamily: "Helvetica-Bold" },
  lowText:      { color: C.green,  fontFamily: "Helvetica-Bold" },

  // Observation bar
  obsRow:   { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  obsLabel: { width: 130, fontSize: 8, color: C.slate },
  obsBar:   { flex: 1, height: 6, backgroundColor: C.border, borderRadius: 3, marginHorizontal: 8 },
  obsFill:  { height: 6, borderRadius: 3 },
  obsCount: { width: 28, fontSize: 8, fontFamily: "Helvetica-Bold", textAlign: "right", color: C.ink },

  // Scan table
  scanRow:  { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.border, borderBottomStyle: "solid" },
  colSensor: { flex: 1, fontSize: 8 },
  colTarget: { flex: 1, fontSize: 7, color: C.muted },
  colObs:    { width: 50, fontSize: 8, textAlign: "right" },
  colDate:   { width: 64, fontSize: 7, color: C.muted, textAlign: "right" },

  // Footer
  footer: {
    position: "absolute",
    bottom: 18,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderTopStyle: "solid",
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: C.muted },

  spacer: { height: 20 },
  spacerSm: { height: 12 },

  // Summary band
  summaryBand: {
    backgroundColor: C.bg,
    borderRadius: 6,
    padding: 14,
    marginBottom: 20,
  },
  summaryTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.ink, marginBottom: 4 },
  summaryBody:  { fontSize: 8, color: C.slate, lineHeight: 1.5 },
});

// â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function severityStyle(rating: string) {
  switch (rating) {
    case "CRITICAL": return s.criticalText;
    case "HIGH":     return s.highText;
    case "MEDIUM":   return s.mediumText;
    default:         return s.lowText;
  }
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtStatus(s: string): string {
  return s.replace(/_/g, " ");
}

// â"€â"€ Report props â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export interface ReportData {
  tenantName: string;
  reportDate: Date;
  readinessScore: number;
  scoreChange: number | null;
  riskCounts: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number };
  totalObservations: number;
  observationsByClass: Record<string, number>;
  risks: { ref: string; title: string; residualRating: string; status: string; cause?: string | null }[];
  recentScans: { sensorName: string; targets: string[]; resultCount: number; completedAt: Date | null; status: string }[];
  frameworkAlignments: { shortName: string; status: string; alignedPct: number }[];
  logoSrc?: string;
  iconSrc?: string;
}

// â"€â"€ Document â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export function QuantumReport({ data }: { data: ReportData }) {
  const totalRisks = data.riskCounts.CRITICAL + data.riskCounts.HIGH + data.riskCounts.MEDIUM + data.riskCounts.LOW;
  const maxObs = Math.max(1, ...Object.values(data.observationsByClass));

  const obsClasses: [string, string, string][] = [
    ["QUANTUM_VULNERABLE",       "Quantum Vulnerable",       C.red],
    ["QUANTUM_REDUCED_SECURITY", "Reduced Security",         C.orange],
    ["QUANTUM_RESILIENT",        "Quantum Resilient",        C.green],
    ["POST_QUANTUM",             "Post-Quantum Ready",       "#059669"],
    ["HYBRID",                   "Hybrid",                   "#6366F1"],
    ["UNKNOWN",                  "Unclassified",             C.muted],
  ];

  return (
    <Document
      title={`VERIQAS Quantum Risk Report — ${data.tenantName}`}
      author="VERIQAS"
      subject="Quantum Cryptographic Risk & Compliance Report"
      creator="VERIQAS"
    >
      {/* â"€â"€ Page 1: Executive Summary â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <Page size="A4" style={s.page}>
        {/* Header band */}
        <View style={s.coverBand}>
          {/* Logo row — icon left, wordmark right, separated by a subtle divider */}
          {(data.iconSrc || data.logoSrc) && (
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20, gap: 10 }}>
              {data.iconSrc && (
                <Image src={data.iconSrc} style={{ width: 36, height: 36 }} />
              )}
              {data.iconSrc && data.logoSrc && (
                <View style={{ width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.2)" }} />
              )}
              {data.logoSrc && (
                <Image src={data.logoSrc} style={{ height: 22, width: "auto" }} />
              )}
            </View>
          )}
          <Text style={s.coverProduct}>Verified Quantum Assurance &amp; Governance</Text>
          <Text style={s.coverTitle}>Quantum Cryptographic{"\n"}Risk Report</Text>
          <Text style={s.coverMeta}>
            {data.tenantName} · Generated {fmtDate(data.reportDate)} · CONFIDENTIAL
          </Text>
        </View>

        <View style={s.body}>
          {/* Executive summary */}
          <View style={s.summaryBand}>
            <Text style={s.summaryTitle}>Executive Summary</Text>
            <Text style={s.summaryBody}>
              {data.tenantName} has a Quantum Readiness Score of {data.readinessScore}/100
              {data.scoreChange !== null && data.scoreChange !== 0
                ? ` (${data.scoreChange > 0 ? "+" : ""}${data.scoreChange} since last period)`
                : ""}
              . Automated cryptographic discovery has identified {data.totalObservations.toLocaleString()} cryptographic observations across the assessed systems and codebases.
              {"\n\n"}
              {data.riskCounts.CRITICAL} CRITICAL and {data.riskCounts.HIGH} HIGH severity quantum risks are currently open, representing immediate exposure to harvest-now-decrypt-later attacks and future quantum decryption. Remediation prioritisation should focus on key establishment and digital signature algorithms first.
            </Text>
          </View>

          {/* KPI strip */}
          <Text style={s.sectionLabel}>Key Metrics</Text>
          <View style={s.kpiRow}>
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Readiness Score</Text>
              <Text style={s.kpiValue}>{data.readinessScore}</Text>
              <Text style={s.kpiSub}>/100 {data.scoreChange !== null ? `(Î"${data.scoreChange > 0 ? "+" : ""}${data.scoreChange})` : ""}</Text>
            </View>
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Open Risks</Text>
              <Text style={[s.kpiValue, { color: C.red }]}>{totalRisks}</Text>
              <Text style={s.kpiSub}>{data.riskCounts.CRITICAL} critical</Text>
            </View>
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Observations</Text>
              <Text style={[s.kpiValue, { color: C.orange }]}>{data.totalObservations.toLocaleString()}</Text>
              <Text style={s.kpiSub}>from {data.recentScans.length} scan{data.recentScans.length !== 1 ? "s" : ""}</Text>
            </View>
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Critical Risks</Text>
              <Text style={[s.kpiValue, { color: C.red }]}>{data.riskCounts.CRITICAL}</Text>
              <Text style={s.kpiSub}>immediate action required</Text>
            </View>
          </View>

          {/* Observation breakdown */}
          <View style={s.spacerSm} />
          <Text style={s.sectionLabel}>Cryptographic Observation Breakdown</Text>
          {obsClasses.filter(([k]) => (data.observationsByClass[k] ?? 0) > 0).map(([key, label, color]) => {
            const count = data.observationsByClass[key] ?? 0;
            return (
              <View key={key} style={s.obsRow}>
                <Text style={s.obsLabel}>{label}</Text>
                <View style={s.obsBar}>
                  <View style={[s.obsFill, { width: `${(count / maxObs) * 100}%`, backgroundColor: color }]} />
                </View>
                <Text style={s.obsCount}>{count}</Text>
              </View>
            );
          })}

          {/* Framework alignment */}
          {data.frameworkAlignments.length > 0 && (
            <>
              <View style={s.spacer} />
              <Text style={s.sectionLabel}>Compliance Framework Alignment</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {data.frameworkAlignments.map((fw) => (
                  <View key={fw.shortName} style={[s.kpiCard, { flex: 1 }]}>
                    <Text style={s.kpiLabel}>{fw.shortName}</Text>
                    <Text style={[s.kpiValue, {
                      fontSize: 16,
                      color: fw.alignedPct >= 80 ? C.green : fw.alignedPct >= 50 ? C.amber : C.red,
                    }]}>
                      {fw.alignedPct}%
                    </Text>
                    <Text style={s.kpiSub}>{fw.status.replace(/_/g, " ").toLowerCase()}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        <Footer tenantName={data.tenantName} reportDate={data.reportDate} pageLabel="Page 1 of 3 - Executive Summary" />
      </Page>

      {/* â"€â"€ Page 2: Risk Register & Scan Activity â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <Page size="A4" style={s.page}>
        <View style={[s.coverBand, { paddingVertical: 14 }]}>
          <Text style={[s.coverProduct, { marginBottom: 0 }]}>
            {data.tenantName} · Quantum Risk Register
          </Text>
        </View>

        <View style={s.body}>
          {/* Risk table */}
          <Text style={s.sectionLabel}>Open Quantum Risks</Text>
          <View style={s.tableHeader}>
            <Text style={[s.colRef,    s.th]}>Ref</Text>
            <Text style={[s.colTitle,  s.th]}>Risk Title</Text>
            <Text style={[s.colRating, s.th]}>Rating</Text>
            <Text style={[s.colStatus, s.th]}>Status</Text>
          </View>
          {data.risks.slice(0, 28).map((r, i) => (
            <View key={r.ref} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <Text style={[s.colRef, { fontFamily: "Courier", color: C.muted }]}>{r.ref}</Text>
              <Text style={s.colTitle}>{r.title}</Text>
              <Text style={[s.colRating, severityStyle(r.residualRating)]}>{r.residualRating}</Text>
              <Text style={[s.colStatus, { color: C.muted }]}>{fmtStatus(r.status)}</Text>
            </View>
          ))}
          {data.risks.length > 28 && (
            <Text style={{ fontSize: 7, color: C.muted, marginTop: 4, textAlign: "right" }}>
              + {data.risks.length - 28} more risks — see full register in the platform
            </Text>
          )}

        </View>

        <Footer tenantName={data.tenantName} reportDate={data.reportDate} pageLabel="Page 2 of 3 - Risk Register" />
      </Page>

      {/* Page 3: Scan Activity */}
      <Page size="A4" style={s.page}>
        <View style={[s.coverBand, { paddingVertical: 14 }]}>
          <Text style={[s.coverProduct, { marginBottom: 0 }]}>
            {data.tenantName} · Recent Scan Activity
          </Text>
        </View>

        <View style={s.body}>
          <Text style={s.sectionLabel}>Recent Scan Activity</Text>
          <View style={s.tableHeader}>
            <Text style={[s.colSensor, s.th]}>Scanner</Text>
            <Text style={[s.colTarget, s.th]}>Target</Text>
            <Text style={[s.colObs,    s.th, { textAlign: "right" }]}>Obs.</Text>
            <Text style={[s.colDate,   s.th, { textAlign: "right" }]}>Date</Text>
          </View>
          {data.recentScans.map((sc, i) => (
            <View key={i} style={[s.scanRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <Text style={s.colSensor}>{sc.sensorName}</Text>
              <Text style={s.colTarget}>{sc.targets.slice(0, 1).join(", ")}</Text>
              <Text style={s.colObs}>{sc.resultCount}</Text>
              <Text style={s.colDate}>{fmtDate(sc.completedAt)}</Text>
            </View>
          ))}

          {/* Disclaimer */}
          <View style={s.spacer} />
          <View style={{ backgroundColor: "#FFFBEB", borderRadius: 4, padding: 10, borderLeftWidth: 3, borderLeftColor: C.amber, borderLeftStyle: "solid" }}>
            <Text style={{ fontSize: 7, color: "#92400E", lineHeight: 1.5 }}>
              This report is generated from automated cryptographic discovery and risk assessment data as of {fmtDate(data.reportDate)}.
              Results represent point-in-time findings and should be reviewed alongside manual assessment outputs.
              This document is CONFIDENTIAL and intended for authorised personnel only.
              VERIQAS · veriqas.io
            </Text>
          </View>
        </View>

        <Footer tenantName={data.tenantName} reportDate={data.reportDate} pageLabel="Page 3 of 3 - Scan Activity" />
      </Page>
    </Document>
  );
}

function Footer({ tenantName, reportDate, pageLabel }: { tenantName: string; reportDate: Date; pageLabel: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>VERIQAS · {tenantName} · CONFIDENTIAL</Text>
      <Text style={s.footerText}>{pageLabel}</Text>
      <Text style={s.footerText}>{fmtDate(reportDate)}</Text>
    </View>
  );
}

