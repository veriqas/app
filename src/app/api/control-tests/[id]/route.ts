import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

const EFFECTIVENESS: Record<string, number> = { PASS: 80, PARTIAL: 40, FAIL: 0 };

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { result, findings, notes, testerId, status, scheduledAt } = body;

  const test = await db.controlTest.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      control: {
        include: { risks: { include: { risk: true } } },
      },
    },
  });
  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (testerId !== undefined) data.testerId = testerId || null;
  if (scheduledAt !== undefined) data.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
  if (findings !== undefined) data.findings = findings;
  if (notes !== undefined) data.notes = notes;

  if (result !== undefined) {
    data.result = result;
    data.status = "COMPLETED";
    data.completedAt = new Date();
  } else if (status !== undefined) {
    data.status = status;
  }

  const updated = await db.controlTest.update({ where: { id }, data });

  // ── Post-result side-effects ─────────────────────────────────────────────
  if (result !== undefined) {
    const effectiveness = EFFECTIVENESS[result] ?? 0;
    const linkedRisks = test.control.risks.map((rc) => rc.risk);

    // Update controlEffectiveness + residual score on linked risks
    await Promise.all(
      linkedRisks.map(async (risk) => {
        const newResidual = Math.max(0, Math.round(risk.inherentScore * (1 - effectiveness / 100)));
        const severityMap: Array<[number, string]> = [
          [16, "CRITICAL"], [9, "HIGH"], [4, "MEDIUM"], [1, "LOW"], [0, "INFORMATIONAL"],
        ];
        const residualRating = severityMap.find(([t]) => newResidual >= t)?.[1] ?? "INFORMATIONAL";
        return db.risk.update({
          where: { id: risk.id },
          data: { controlEffectiveness: effectiveness, residualScore: newResidual, residualRating },
        });
      })
    );

    // Update control lastTestedAt + nextTestDue
    const freqDays: Record<string, number> = {
      ANNUAL: 365, SEMI_ANNUAL: 180, QUARTERLY: 90, MONTHLY: 30, AD_HOC: 0,
    };
    const days = freqDays[test.control.testFrequency ?? "ANNUAL"] ?? 365;
    const nextDue = new Date();
    if (days > 0) nextDue.setDate(nextDue.getDate() + days);

    await db.control.update({
      where: { id: test.controlId },
      data: {
        lastTestedAt: new Date(),
        nextTestDue: days > 0 ? nextDue : undefined,
        implementationStatus: result === "PASS" ? "IMPLEMENTED" : result === "PARTIAL" ? "PARTIALLY_IMPLEMENTED" : "NOT_IMPLEMENTED",
      },
    });

    // On FAIL: auto-create a remediation action
    if (result === "FAIL") {
      const actionRef = `ACT-FAIL-${Date.now().toString(36).toUpperCase()}`;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
      await db.action.create({
        data: {
          ref: actionRef,
          tenantId: ctx.tenantId,
          title: `Control Failure — Remediate: ${test.control.title}`,
          description: `Control test ${test.ref} failed. Findings: ${findings || "See test record."}`,
          actionType: "REMEDIATION",
          priority: "HIGH",
          status: "OPEN",
          dueDate,
          ownerId: ctx.userId,
        },
      });
    }
  }

  return NextResponse.json({ test: updated });
}
