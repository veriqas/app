import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface CheckovResult {
  check_id:   string;
  check_name: string;
  result:     "passed" | "failed" | "skipped";
  resource:   string;
  file_path:  string;
  file_line_range: [number, number];
  check_type: string;
}

export interface CheckovOutput {
  results: {
    passed_checks: CheckovResult[];
    failed_checks: CheckovResult[];
    skipped_checks: CheckovResult[];
  };
  summary: {
    passed:  number;
    failed:  number;
    skipped: number;
    resource_count: number;
  };
}

export async function isCheckovAvailable(): Promise<boolean> {
  try {
    await execFileAsync("checkov", ["--version"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

export async function runCheckov(repoDir: string): Promise<CheckovOutput> {
  try {
    const { stdout } = await execFileAsync(
      "checkov",
      [
        "--directory", repoDir,
        "--output", "json",
        "--quiet",
        "--check", "CKV_K8S_,CKV_TLS_,CKV_AWS_17,CKV_AWS_87,CKV_AZURE_,CKV_GCP_",
        "--compact",
      ],
      { timeout: 300_000, maxBuffer: 50 * 1024 * 1024 }
    );
    return JSON.parse(stdout) as CheckovOutput;
  } catch (err: unknown) {
    // checkov exits 1 when checks fail — that's normal
    const e = err as { code?: number; stdout?: string };
    if (e.code === 1 && e.stdout) {
      try {
        return JSON.parse(e.stdout) as CheckovOutput;
      } catch {
        // fall through
      }
    }
    console.warn("[CheckovEngine]", err instanceof Error ? err.message : err);
    return {
      results: { passed_checks: [], failed_checks: [], skipped_checks: [] },
      summary: { passed: 0, failed: 0, skipped: 0, resource_count: 0 },
    };
  }
}
