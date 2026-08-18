import { NextResponse } from "next/server";
import { getServerSession, requirePermissionApi, isAuthError } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/** Case severity drives the task's default priority. */
function priorityFor(quantumClass: string | null, primitiveType: string | null) {
  const publicKey = ["DIGITAL_SIGNATURE", "KEY_ESTABLISHMENT", "PUBLIC_KEY_ENCRYPTION"].includes(String(primitiveType));
  if (quantumClass === "QUANTUM_VULNERABLE") return publicKey ? "CRITICAL" : "HIGH";
  if (quantumClass === "QUANTUM_REDUCED_SECURITY" || quantumClass === "HYBRID") return "MEDIUM";
  return "LOW";
}

function shortId() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

// GET — who can this be assigned to, and is it already assigned?
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermissionApi("actions:assign");
  if (isAuthError(guard)) return guard;
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [users, links] = await Promise.all([
    db.user.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    db.actionEntity.findMany({
      where: { remediationCaseId: id, action: { tenantId: ctx.tenantId } },
      select: { action: { select: { id: true, ref: true, title: true, status: true, priority: true, dueDate: true, assignee: { select: { id: true, name: true, email: true } } } } },
    }),
  ]);
  return NextResponse.json({
    users,
    assignments: links.map(l => l.action).filter(a => !["COMPLETED", "CLOSED"].includes(a.status)),
  });
}

/**
 * POST — assign a review of this case to a user.
 *
 * Creates an Action (the platform's existing task record) linked to the case, so
 * the work appears in the assignee's My Work alongside everything else they own
 * rather than in a separate remediation-only inbox.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermissionApi("actions:assign");
  if (isAuthError(guard)) return guard;
  const ctx = await getServerSession();
  if (!ctx?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => ({})) as { assigneeId?: string; dueDate?: string; note?: string };
  if (!body.assigneeId) return NextResponse.json({ error: "An assignee is required." }, { status: 400 });

  const rc = await db.remediationCase.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      findings: { select: { observation: { select: { quantumClass: true, primitiveType: true } } } },
      attempts: { orderBy: { attemptNumber: "asc" }, select: { status: true, strategy: true } },
      verificationRuns: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
    },
  });
  if (!rc) return NextResponse.json({ error: "Case not found" }, { status: 404 });

  const assignee = await db.user.findFirst({ where: { id: body.assigneeId, tenantId: ctx.tenantId, isActive: true }, select: { id: true, name: true, email: true } });
  if (!assignee) return NextResponse.json({ error: "Assignee not found in this organisation." }, { status: 400 });

  const quantumClass = String(rc.findings.find(f => f.observation?.quantumClass)?.observation?.quantumClass ?? "UNKNOWN");
  const primitiveType = (rc.findings.find(f => f.observation?.primitiveType)?.observation?.primitiveType ?? null) as string | null;
  const latest = rc.attempts[rc.attempts.length - 1];
  const verdict = rc.verificationRuns[0]?.status ?? null;

  // Describe what the reviewer is being asked to look at, from evidence only.
  const what = latest?.status === "OUT_OF_POLICY"
    ? "The proposed migration was blocked by the strategy policy and needs a human decision."
    : latest?.strategy === "MANUAL_REVIEW"
    ? "VERIQAS determined that automatic migration would introduce unacceptable uncertainty."
    : verdict
    ? `Scanners returned ${verdict.replace(/_/g, " ").toLowerCase()}; confirm before any change is applied.`
    : "Review the correlated findings and decide how to proceed.";

  const action = await db.action.create({
    data: {
      ref: `ACT-${shortId()}`,
      tenantId: ctx.tenantId,
      assigneeId: assignee.id,
      ownerId: ctx.userId !== "system" ? ctx.userId : null,
      title: `Review remediation case ${rc.ref} — ${rc.algorithm ?? "cryptographic finding"}`,
      description: [
        what,
        rc.affectedFiles.length ? `Affected: ${rc.affectedFiles.join(", ")}` : null,
        body.note?.trim() ? `Note: ${body.note.trim()}` : null,
      ].filter(Boolean).join("\n"),
      actionType: "REMEDIATION",
      priority: priorityFor(quantumClass, primitiveType) as never,
      status: "OPEN",
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
    },
    select: { id: true, ref: true, title: true, priority: true, dueDate: true, status: true },
  });

  await db.actionEntity.create({
    data: { actionId: action.id, entityType: "REMEDIATION_CASE", remediationCaseId: rc.id },
  });

  return NextResponse.json({ action, assignee }, { status: 201 });
}
