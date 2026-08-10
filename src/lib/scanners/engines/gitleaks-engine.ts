import { execFile } from "child_process";
import { promisify } from "util";
import { resolveBinary } from "./resolve-binary";

const execFileAsync = promisify(execFile);
const BIN = resolveBinary("gitleaks");

export interface GitleaksFinding {
  RuleID:      string;
  Description: string;
  File:        string;
  StartLine:   number;
  Match:       string;
  Secret:      string;
  Commit:      string;
  Author:      string;
  Date:        string;
  Tags:        string[];
}

export interface GitleaksOutput {
  findings: GitleaksFinding[];
}

export async function isGitleaksAvailable(): Promise<boolean> {
  try {
    await execFileAsync(BIN, ["version"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

export async function runGitleaks(repoDir: string): Promise<GitleaksOutput> {
  const { tmpdir } = await import("os");
  const { join } = await import("path");
  const { unlinkSync, existsSync } = await import("fs");
  const reportPath = join(tmpdir(), `gitleaks-${Date.now()}.json`);

  try {
    // Run git log scan (catches secrets in both files and history)
    // Exit code 1 = findings found (normal), 0 = clean, anything else = error
    await execFileAsync(
      BIN,
      [
        "detect",
        "--source", repoDir,
        "--report-format", "json",
        "--report-path", reportPath,
        "--log-opts=--all",       // scan entire git history, not just HEAD
        "--no-banner",
      ],
      { timeout: 180_000, maxBuffer: 50 * 1024 * 1024 }
    ).catch((err: { code?: number }) => {
      // Exit 1 means findings found — not an error
      if (err.code !== 1) throw err;
    });

    if (!existsSync(reportPath)) return { findings: [] };
    const { readFileSync } = await import("fs");
    const raw: GitleaksFinding[] = JSON.parse(readFileSync(reportPath, "utf-8") || "[]");
    return { findings: Array.isArray(raw) ? raw : [] };
  } catch (err) {
    console.warn("[GitleaksEngine]", err instanceof Error ? err.message : err);
    return { findings: [] };
  } finally {
    if (existsSync(reportPath)) unlinkSync(reportPath);
  }
}
