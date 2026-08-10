/**
 * Nmap engine — https://nmap.org
 * Network discovery and TLS/SSH cryptographic enumeration using NSE scripts.
 * Scripts used:
 *   ssl-enum-ciphers  — enumerates accepted TLS cipher suites + strength
 *   ssh2-enum-algos   — enumerates SSH host key, KEX, cipher, MAC algorithms
 *   ssl-cert          — extracts certificate details
 *   tls-alpn          — checks ALPN protocol support
 * Returns parsed XML output as a structured object for the nmap adapter.
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface NmapHost {
  address: string;
  hostnames: string[];
  ports: NmapPort[];
  status: "up" | "down";
}

export interface NmapPort {
  portId: number;
  protocol: string;
  state: string;
  service: string;
  scripts: Record<string, string>; // scriptId → raw output text
}

export interface NmapOutput {
  hosts: NmapHost[];
  scanInfo: { startStr: string; elapsed: string };
}

export async function isNmapAvailable(): Promise<boolean> {
  try {
    await execFileAsync("nmap", ["--version"], { timeout: 8_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Scan targets for TLS and SSH cryptographic configuration.
 * targets: array of hostnames, IPs, or CIDR ranges.
 */
export async function runNmap(targets: string[]): Promise<NmapOutput> {
  // Nmap XML output to stdout (-oX -)
  const { stdout } = await execFileAsync(
    "nmap",
    [
      "-sV",
      "--script", "ssl-enum-ciphers,ssl-cert,ssh2-enum-algos,tls-alpn",
      "--script-timeout", "30s",
      "-T4",
      "-oX", "-",
      "--open",
      ...targets,
    ],
    { timeout: 300_000, maxBuffer: 50 * 1024 * 1024 }
  );

  return parseNmapXml(stdout);
}

/** Lightweight XML → structured object parser for Nmap output */
function parseNmapXml(xml: string): NmapOutput {
  const hosts: NmapHost[] = [];

  // Extract scan metadata
  const startMatch = xml.match(/startstr="([^"]+)"/);
  const elapsedMatch = xml.match(/elapsed="([^"]+)"/);
  const scanInfo = {
    startStr: startMatch?.[1] ?? "",
    elapsed: elapsedMatch?.[1] ?? "",
  };

  // Split by host blocks
  const hostBlocks = xml.match(/<host\b[^>]*>[\s\S]*?<\/host>/g) ?? [];

  for (const block of hostBlocks) {
    // Address
    const addrMatch = block.match(/<address addr="([^"]+)" addrtype="ipv4"/);
    const address = addrMatch?.[1] ?? "";

    // Status
    const statusMatch = block.match(/<status state="([^"]+)"/);
    const status = (statusMatch?.[1] ?? "down") as "up" | "down";

    // Hostnames
    const hostnameMatches = [...block.matchAll(/<hostname name="([^"]+)"/g)];
    const hostnames = hostnameMatches.map(m => m[1]);

    // Ports
    const portBlocks = block.match(/<port\b[^>]*>[\s\S]*?<\/port>/g) ?? [];
    const ports: NmapPort[] = [];

    for (const pb of portBlocks) {
      const portIdMatch = pb.match(/portid="(\d+)"/);
      const protocolMatch = pb.match(/protocol="([^"]+)"/);
      const stateMatch = pb.match(/<state state="([^"]+)"/);
      const serviceMatch = pb.match(/<service name="([^"]+)"/);

      // Script outputs
      const scripts: Record<string, string> = {};
      const scriptBlocks = pb.match(/<script id="([^"]+)" output="([^"]+)"/g) ?? [];
      for (const sb of scriptBlocks) {
        const scriptIdMatch = sb.match(/id="([^"]+)"/);
        const outputMatch = sb.match(/output="([^"]+)"/);
        if (scriptIdMatch && outputMatch) {
          scripts[scriptIdMatch[1]] = decodeXmlEntities(outputMatch[1]);
        }
      }

      // For multi-line script output (CDATA style)
      const scriptFullBlocks = pb.match(/<script id="([^"]+)"[^>]*>([\s\S]*?)<\/script>/g) ?? [];
      for (const sfb of scriptFullBlocks) {
        const idM = sfb.match(/id="([^"]+)"/);
        if (idM) {
          const textContent = sfb.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          scripts[idM[1]] = textContent;
        }
      }

      ports.push({
        portId: parseInt(portIdMatch?.[1] ?? "0", 10),
        protocol: protocolMatch?.[1] ?? "tcp",
        state: stateMatch?.[1] ?? "unknown",
        service: serviceMatch?.[1] ?? "unknown",
        scripts,
      });
    }

    hosts.push({ address, hostnames, ports, status });
  }

  return { hosts, scanInfo };
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g,  "&")
    .replace(/&lt;/g,   "<")
    .replace(/&gt;/g,   ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
