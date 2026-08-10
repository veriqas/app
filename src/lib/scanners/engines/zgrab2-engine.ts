/**
 * ZGrab2 engine — shells out to the `zgrab2` Go binary.
 * Runs TLS and SSH modules across a target list and returns
 * output compatible with the existing zgrab2 adapter.
 * Falls back to null if zgrab2 is not installed.
 */

import { spawn } from "child_process";
import { createWriteStream } from "fs";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

export async function isZgrab2Available(): Promise<boolean> {
  return new Promise(resolve => {
    const p = spawn("zgrab2", ["--help"], { stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("close", () => resolve(true));
  });
}

function runZgrab2Module(
  module: string,
  targets: string[],
  extraArgs: string[] = []
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const results: unknown[] = [];
    const args = [module, ...extraArgs];
    const proc = spawn("zgrab2", args, { stdio: ["pipe", "pipe", "ignore"] });

    // Feed targets via stdin (one per line)
    proc.stdin.write(targets.join("\n") + "\n");
    proc.stdin.end();

    let buf = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try { results.push(JSON.parse(trimmed)); } catch { /* skip malformed */ }
      }
    });

    proc.on("close", () => {
      // Flush remaining buffer
      if (buf.trim()) {
        try { results.push(JSON.parse(buf.trim())); } catch { /* ignore */ }
      }
      resolve(results);
    });

    proc.on("error", reject);

    setTimeout(() => { proc.kill(); resolve(results); }, 90_000);
  });
}

export async function runZgrab2(targets: string[]): Promise<unknown[] | null> {
  if (!(await isZgrab2Available())) return null;

  // Strip protocols — zgrab2 takes bare hostnames/IPs
  const hosts = targets.map(t =>
    t.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "")
  );

  try {
    // Run TLS module (port 443 by default)
    const tlsResults = await runZgrab2Module("tls", hosts, ["--port", "443"]);
    return tlsResults;
  } catch (err) {
    console.warn("[Zgrab2Engine] scan failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
