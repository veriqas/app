/**
 * Osquery engine — runs crypto-relevant queries against the local osquery daemon.
 * For fleet deployments, targets should be fleet API endpoints.
 * Falls back to local osqueryi for single-host assessment.
 */
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface OsqueryRow {
  [column: string]: string;
}

export interface OsqueryQueryResult {
  query: string;
  rows:  OsqueryRow[];
}

export interface OsqueryOutput {
  results: OsqueryQueryResult[];
  host:    string;
}

const CRYPTO_QUERIES: { name: string; sql: string }[] = [
  {
    name: "tls_connections",
    sql:  "SELECT pid, remote_address, remote_port, state FROM process_open_sockets WHERE remote_port IN (443, 8443, 636, 993, 995, 465) LIMIT 200;",
  },
  {
    name: "certificates",
    sql:  "SELECT common_name, issuer, not_valid_after, sha1 FROM certificates LIMIT 200;",
  },
  {
    name: "ssh_keys",
    sql:  "SELECT uid, path, encrypted FROM user_ssh_keys;",
  },
  {
    name: "listening_ports",
    sql:  "SELECT pid, port, protocol, address FROM listening_ports WHERE port IN (22, 443, 8443, 636, 993) LIMIT 100;",
  },
];

export async function isOsqueryAvailable(): Promise<boolean> {
  try {
    await execFileAsync("osqueryi", ["--version"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

export async function runOsquery(_targets: string[]): Promise<OsqueryOutput> {
  const results: OsqueryQueryResult[] = [];
  let host = "localhost";

  try {
    const { stdout: hostnameOut } = await execFileAsync("osqueryi", [
      "--json", "SELECT hostname FROM system_info LIMIT 1;"
    ], { timeout: 10_000 });
    const parsed = JSON.parse(hostnameOut);
    host = parsed[0]?.hostname ?? "localhost";
  } catch {
    // continue
  }

  for (const q of CRYPTO_QUERIES) {
    try {
      const { stdout } = await execFileAsync(
        "osqueryi",
        ["--json", q.sql],
        { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 }
      );
      results.push({ query: q.name, rows: JSON.parse(stdout) });
    } catch (err) {
      console.warn(`[OsqueryEngine] query ${q.name} failed:`, err instanceof Error ? err.message : err);
      results.push({ query: q.name, rows: [] });
    }
  }

  return { results, host };
}
