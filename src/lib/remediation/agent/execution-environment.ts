// RemediationExecutionEnvironment — the ONLY boundary between the AI orchestrator
// and the real execution substrate. The orchestrator never calls Docker, git, or
// scanners directly; it goes through this interface. Production maps 1:1 onto the
// EXISTING in-container model (clone to /tmp, run scanners via the public engine
// interfaces, ephemeral cleanup). Tests inject a fake — a test seam, NOT a second
// production path.
//
// SECURITY: executeBuild/executeTests run arbitrary repository-controlled code and
// are NOT safe in the current app/worker container (which holds ANTHROPIC_API_KEY,
// INTERNAL_SECRET, DATABASE_URL). They therefore return SKIPPED until a genuine
// isolated sandbox exists. SKIPPED is never reported as PASS.

import * as fs from "fs";
import * as path from "path";
import { cloneRepo } from "@/lib/scanners/engines/git-clone";
import { runScannersForVerification, realScannerRunnerDeps, type RunScannersResult } from "@/lib/remediation/verification/scanner-runner";

export interface Workspace {
  id: string;
  dir: string;
  repoUrl: string;
  cleanup: () => void;
}

export interface AppliedChange {
  filePath: string;
  changeType: "MODIFY" | "ADD" | "DELETE" | "DEP_UPGRADE";
  newContent?: string;
}

export type ExecStatus = "SKIPPED" | "PASS" | "FAIL" | "NOT_RUN" | "ERROR";
export interface ExecOutcome {
  status: ExecStatus;
  reason?: string;
  command?: string;
}

export interface RemediationExecutionEnvironment {
  createWorkspace(repoUrl: string): Promise<Workspace>;
  applyChanges(ws: Workspace, changes: AppliedChange[]): Promise<void>;
  executeScanner(ws: Workspace, sensorTypes: string[], tenantId: string): Promise<RunScannersResult>;
  executeBuild(ws: Workspace): Promise<ExecOutcome>;
  executeTests(ws: Workspace): Promise<ExecOutcome>;
  collectEvidence(ws: Workspace): Promise<{ rootFiles: string[] }>;
  destroyWorkspace(ws: Workspace): Promise<void>;
}

const SKIPPED_REASON = "No isolated arbitrary-code execution environment configured; build/test not run in the app container for security.";

// Production implementation over the existing container substrate.
export class ContainerExecutionEnvironment implements RemediationExecutionEnvironment {
  async createWorkspace(repoUrl: string): Promise<Workspace> {
    const { dir, cleanup } = await cloneRepo(repoUrl);
    return { id: path.basename(dir), dir, repoUrl, cleanup };
  }

  async applyChanges(ws: Workspace, changes: AppliedChange[]): Promise<void> {
    for (const c of changes) {
      const target = safeResolveInside(ws.dir, c.filePath);
      if (c.changeType === "DELETE") {
        try { fs.rmSync(target, { force: true }); } catch {}
        continue;
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, c.newContent ?? "", "utf-8");
    }
  }

  async executeScanner(ws: Workspace, sensorTypes: string[], tenantId: string): Promise<RunScannersResult> {
    // Re-run the RELEVANT scanners against the patched workspace via the existing
    // public engine interfaces (read-only; never writes observations).
    return runScannersForVerification(
      { repoUrl: ws.repoUrl, sensorTypes, tenantId, phase: "AFTER", clonedDir: ws.dir },
      realScannerRunnerDeps,
    );
  }

  async executeBuild(): Promise<ExecOutcome> {
    return { status: "SKIPPED", reason: SKIPPED_REASON };
  }

  async executeTests(): Promise<ExecOutcome> {
    return { status: "SKIPPED", reason: SKIPPED_REASON };
  }

  async collectEvidence(ws: Workspace): Promise<{ rootFiles: string[] }> {
    let rootFiles: string[] = [];
    try { rootFiles = fs.readdirSync(ws.dir); } catch { rootFiles = []; }
    return { rootFiles };
  }

  async destroyWorkspace(ws: Workspace): Promise<void> {
    ws.cleanup();
  }
}

// Reject path traversal / absolute escapes — every write must stay inside the workspace.
export function safeResolveInside(baseDir: string, relPath: string): string {
  const normalizedBase = path.resolve(baseDir);
  const resolved = path.resolve(normalizedBase, relPath);
  const rel = path.relative(normalizedBase, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Refusing to write outside the workspace: ${relPath}`);
  }
  return resolved;
}
