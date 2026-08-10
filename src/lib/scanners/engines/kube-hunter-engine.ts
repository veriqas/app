import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface KubeHunterVulnerability {
  id:          string;
  location:    string;
  category:    string;
  severity:    string;
  vulnerability: string;
  description: string;
  evidence:    string;
}

export interface KubeHunterService {
  service:  string;
  location: string;
  type:     string;
}

export interface KubeHunterOutput {
  vulnerabilities: KubeHunterVulnerability[];
  services:        KubeHunterService[];
}

export async function isKubeHunterAvailable(): Promise<boolean> {
  try {
    await execFileAsync("kube-hunter", ["--version"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

export async function runKubeHunter(targets: string[]): Promise<KubeHunterOutput> {
  const args = ["--report", "json", "--log", "none"];
  // If targets look like IP ranges, use --cidr; otherwise --remote
  for (const t of targets) {
    if (t.includes("/")) {
      args.push("--cidr", t);
    } else {
      args.push("--remote", t);
    }
  }

  try {
    const { stdout } = await execFileAsync("kube-hunter", args, {
      timeout: 300_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    const raw = JSON.parse(stdout);
    return {
      vulnerabilities: raw.vulnerabilities ?? [],
      services:        raw.services ?? [],
    };
  } catch (err) {
    console.warn("[KubeHunterEngine]", err instanceof Error ? err.message : err);
    return { vulnerabilities: [], services: [] };
  }
}
