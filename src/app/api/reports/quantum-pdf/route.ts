import { NextResponse } from "next/server";
import { getServerSession, requirePermissionApi, isAuthError } from "@/lib/auth/session";
import { getPostureSummary } from "@/lib/services/posture.service";
import { db } from "@/lib/db/client";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { QuantumReport } from "@/lib/reports/quantum-report";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const guard = await requirePermissionApi("reporting:board");
  if (isAuthError(guard)) return guard;
  try {
    const ctx = await getServerSession();
    if (!ctx?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = ctx.tenantId;

    // Fetch all data in parallel
    const [posture, tenant, risks] = await Promise.all([
      getPostureSummary(tenantId).catch(() => null),
      db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      db.risk.findMany({
        where: { tenantId, isActive: true, status: { not: "CLOSED" } },
        orderBy: [{ residualRating: "asc" }, { inherentScore: "desc" }],
        select: { ref: true, title: true, residualRating: true, status: true, cause: true },
        take: 50,
      }),
    ]);

    const tenantName = tenant?.name ?? "VERIQAS Client";
    const reportDate = new Date();

    function loadImageAsDataUri(filename: string): string | undefined {
      try {
        const filePath = path.join(process.cwd(), "public", filename);
        const buf = fs.readFileSync(filePath);
        return `data:image/png;base64,${buf.toString("base64")}`;
      } catch {
        return undefined;
      }
    }

    const reportData = {
      tenantName,
      reportDate,
      readinessScore: posture?.readinessScore ?? 0,
      scoreChange: posture?.scoreChange ?? null,
      riskCounts: posture?.riskCounts ?? { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
      totalObservations: posture?.totalObservations ?? 0,
      observationsByClass: posture?.observationsByClass ?? {
        QUANTUM_VULNERABLE: 0,
        QUANTUM_REDUCED_SECURITY: 0,
        QUANTUM_RESILIENT: 0,
        POST_QUANTUM: 0,
        HYBRID: 0,
        UNKNOWN: 0,
      },
      risks: risks.map((r) => ({
        ref: r.ref,
        title: r.title,
        residualRating: r.residualRating,
        status: r.status,
        cause: r.cause,
      })),
      recentScans: (posture?.recentScans ?? []).map((s) => ({
        sensorName: s.sensorName,
        targets: s.targets,
        resultCount: s.resultCount,
        completedAt: s.completedAt,
        status: s.status,
      })),
      frameworkAlignments: (posture?.frameworkAlignments ?? []).slice(0, 4),
      iconSrc: loadImageAsDataUri("icon_veriqas.png"),
      logoSrc: loadImageAsDataUri("veriqas_logo.png"),
    };

    // Call the component function directly — bypasses Next.js server-component wrapping
    // which react-pdf's renderer cannot handle.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = (QuantumReport as any)({ data: reportData });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(element as any);

    const filename = `veriqas-quantum-report-${tenantName.toLowerCase().replace(/\s+/g, "-")}-${reportDate.toISOString().slice(0, 10)}.pdf`;

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[pdf-report]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate report" },
      { status: 500 }
    );
  }
}

