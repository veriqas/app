import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { isV2Enabled } from "@/lib/remediation/feature-flag";
import { runRemediation } from "@/lib/remediation/agent/orchestrator";
import { AnthropicAIClient } from "@/lib/remediation/agent/ai-client";
import { ContainerExecutionEnvironment } from "@/lib/remediation/agent/execution-environment";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/remediation/cases/[id]/remediate — list AI remediation attempts (V2).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isV2Enabled()) return NextResponse.json({ engine: "v1", attempts: [] });

  const { id } = await params;
  const attempts = await db.remediationAttempt.findMany({
    where: { caseId: id, tenantId: ctx.tenantId },
    orderBy: { attemptNumber: "asc" },
    include: { changes: true, stageResults: { select: { stage: true, createdAt: true } } },
    take: 20,
  });
  return NextResponse.json({ engine: "v2", attempts });
}

// POST /api/remediation/cases/[id]/remediate — run the staged AI remediation loop (V2).
// Uses the production container execution environment (build/test SKIPPED-safe).
// The deterministic verification engine decides the verdict — never the AI.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isV2Enabled()) {
    return NextResponse.json(
      { error: "AI Remediation (V2) is not enabled. Set REMEDIATION_ENGINE=v2 to use it." },
      { status: 501 },
    );
  }

  const { id } = await params;
  const outcome = await runRemediation(id, ctx.tenantId, {
    ai: new AnthropicAIClient(),
    env: new ContainerExecutionEnvironment(),
  });
  return NextResponse.json({ engine: "v2", ...outcome }, { status: 201 });
}
