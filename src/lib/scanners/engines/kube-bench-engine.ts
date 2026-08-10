import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface KubeBenchResult {
  test_number: string;
  test_desc:   string;
  status:      "PASS" | "FAIL" | "WARN" | "INFO";
  reason:      string;
}

export interface KubeBenchSection {
  id:      string;
  text:    string;
  tests:   { desc: string; results: KubeBenchResult[] }[];
}

export interface KubeBenchOutput {
  controls: KubeBenchSection[];
  totals:   { total_pass: number; total_fail: number; total_warn: number; total_info: number };
}

export async function isKubeBenchAvailable(): Promise<boolean> {
  try {
    await execFileAsync("kube-bench", ["--version"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

export async function runKubeBench(_targets: string[]): Promise<KubeBenchOutput> {
  try {
    const { stdout } = await execFileAsync(
      "kube-bench",
      ["--json"],
      { timeout: 300_000, maxBuffer: 50 * 1024 * 1024 }
    );
    return JSON.parse(stdout) as KubeBenchOutput;
  } catch (err) {
    console.warn("[KubeBenchEngine]", err instanceof Error ? err.message : err);
    return { controls: [], totals: { total_pass: 0, total_fail: 0, total_warn: 0, total_info: 0 } };
  }
}
