import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PQC_REPLACEMENTS: Record<string, { algorithm: string; rationale: string }> = {
  "RSA-2048":    { algorithm: "ML-KEM-768 (FIPS 203) for key encapsulation or ML-DSA-65 (FIPS 204) for signatures", rationale: "RSA-2048 is broken by Shor's algorithm on quantum computers. ML-KEM and ML-DSA are NIST-standardised post-quantum replacements." },
  "RSA-4096":    { algorithm: "ML-DSA-87 (FIPS 204) for signatures or ML-KEM-1024 (FIPS 203) for key encapsulation", rationale: "RSA is quantum-vulnerable regardless of key size. Use NIST PQC standards." },
  "MD5":         { algorithm: "SHA-256 or SHA-3-256 for integrity; bcrypt/Argon2 for passwords", rationale: "MD5 is classically broken for collision resistance and quantum-reduced for preimage. Use SHA-256 minimum." },
  "SHA-1":       { algorithm: "SHA-256 or SHA-3-256", rationale: "SHA-1 is classically broken for collision resistance." },
  "SHA-256":     { algorithm: "SHA-256 is acceptable for most uses today. For long-term post-quantum security consider SHA-3-256 or SHAKE-256.", rationale: "SHA-256 has quantum-reduced security (128-bit post-quantum) — acceptable short-term, but flag for migration planning." },
  "HMAC-SHA256": { algorithm: "HMAC-SHA256 remains acceptable. For PQC migration use HMAC-SHA3-256 or a PQC-KEM derived MAC.", rationale: "HMAC-SHA256 has reduced but sufficient security today. Plan migration to SHA-3 based MACs." },
  "EC-P256":     { algorithm: "ML-KEM-768 (FIPS 203) for key establishment, ML-DSA-65 (FIPS 204) for signatures", rationale: "Elliptic curve cryptography is broken by Shor's algorithm." },
  "ECDSA":       { algorithm: "ML-DSA-65 (FIPS 204) — NIST post-quantum digital signature standard", rationale: "ECDSA is vulnerable to Shor's algorithm." },
  "DH":          { algorithm: "ML-KEM-768 (FIPS 203)", rationale: "Classic Diffie-Hellman is broken by Shor's algorithm." },
};

function getPqcGuidance(algorithm: string): { algorithm: string; rationale: string } {
  const exact = PQC_REPLACEMENTS[algorithm];
  if (exact) return exact;
  for (const [key, val] of Object.entries(PQC_REPLACEMENTS)) {
    if (algorithm.toUpperCase().includes(key.replace("-", ""))) return val;
  }
  return {
    algorithm: "consult NIST PQC standards (FIPS 203/204/205) for an appropriate replacement",
    rationale: `${algorithm} should be assessed against NIST PQC guidelines.`,
  };
}

async function cloneAndReadFile(repoUrl: string, filePath: string): Promise<string | null> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "veriqas-rem-"));
  try {
    execSync(`git clone --depth 1 "${repoUrl}" "${tmpDir}/repo"`, {
      timeout: 60000,
      stdio: "pipe",
    });
    const fullPath = path.join(tmpDir, "repo", filePath);
    if (!fs.existsSync(fullPath)) return null;
    const content = fs.readFileSync(fullPath, "utf-8");
    // Safety: limit to 8000 chars to keep within token budget
    return content.slice(0, 8000);
  } catch {
    return null;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function generateUnifiedDiff(original: string, patched: string, filePath: string): string {
  const origLines = original.split("\n");
  const patchLines = patched.split("\n");
  const diff: string[] = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
  ];

  // Simple line-by-line diff
  const maxLen = Math.max(origLines.length, patchLines.length);
  let i = 0;
  while (i < maxLen) {
    const o = origLines[i] ?? "";
    const p = patchLines[i] ?? "";
    if (o !== p) {
      diff.push(`@@ -${i + 1} +${i + 1} @@`);
      if (o) diff.push(`-${o}`);
      if (p) diff.push(`+${p}`);
    }
    i++;
  }
  return diff.join("\n");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Internal-only endpoint
  const secret = req.headers.get("x-internal-secret");
  if (secret !== (process.env.INTERNAL_SECRET ?? "veriqas-internal")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Load the job
  const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(`
    SELECT rj.*, co."algorithm" as obs_algorithm, co."filePath" as obs_filepath,
           co."lineNumber", co."quantumClass", co."context", sj.targets
    FROM senqor."RemediationJob" rj
    JOIN senqor."CryptoObservation" co ON co.id = rj."observationId"
    LEFT JOIN senqor."ScanJob" sj ON sj.id = co."scanJobId"
    WHERE rj.id = $1 LIMIT 1
  `, id);

  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const job = rows[0] as Record<string, unknown>;

  const repoUrl = job.repoUrl as string;
  const filePath = job.filePath as string;
  const algorithm = (job.obs_algorithm ?? job.algorithm) as string;
  const lineNumber = job.lineNumber as number | null;

  try {
    // 1. Clone repo and read file
    await db.$executeRawUnsafe(`UPDATE senqor."RemediationJob" SET "updatedAt" = NOW() WHERE id = $1`, id);

    const originalContent = await cloneAndReadFile(repoUrl, filePath);
    if (!originalContent) {
      await db.$executeRawUnsafe(`
        UPDATE senqor."RemediationJob" SET status = 'FAILED', "errorMessage" = $2, "updatedAt" = NOW() WHERE id = $1
      `, id, `Could not read file: ${filePath} from ${repoUrl}`);
      return NextResponse.json({ error: "File read failed" }, { status: 422 });
    }

    const pqcGuide = getPqcGuidance(algorithm);

    // 2. Call Claude to generate the remediated file
    const systemPrompt = `You are a post-quantum cryptography expert and senior software engineer.
Your task is to remediate quantum-vulnerable cryptographic code in a source file.
You will receive a file containing vulnerable code, and you must return ONLY the complete remediated file content — no explanations, no markdown, no code fences.
Return the exact file with the minimal changes needed to replace the vulnerable algorithm with its post-quantum equivalent.
Add a brief inline comment on changed lines explaining the migration (e.g. // Migrated from RSA-2048 to ML-KEM-768 (FIPS 203) for post-quantum security).
If the algorithm cannot be replaced without deeper architectural changes, make the safest incremental change possible and add a TODO comment.`;

    const userPrompt = `File: ${filePath}
Repository: ${repoUrl}
Vulnerable algorithm: ${algorithm}${lineNumber ? ` (approximately line ${lineNumber})` : ""}
Recommended replacement: ${pqcGuide.algorithm}
Rationale: ${pqcGuide.rationale}

Return ONLY the complete remediated file content with no markdown wrapper:

${originalContent}`;

    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8192,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    const patchedContent = (response.content[0] as { type: string; text: string }).text.trim();
    const diffPatch = generateUnifiedDiff(originalContent, patchedContent, filePath);

    const reasoning = `Agent analysed ${filePath} for ${algorithm} usage. ${pqcGuide.rationale} Replaced with: ${pqcGuide.algorithm}. Review the diff carefully before approving — architectural changes may be needed for full PQC migration.`;

    // 3. Store results
    await db.$executeRawUnsafe(`
      UPDATE senqor."RemediationJob"
      SET status = 'REVIEW',
          "originalContent" = $2,
          "patchedContent" = $3,
          "diffPatch" = $4,
          "agentReasoning" = $5,
          "suggestedAlgorithm" = $6,
          "updatedAt" = NOW()
      WHERE id = $1
    `, id, originalContent, patchedContent, diffPatch, reasoning, pqcGuide.algorithm);

    return NextResponse.json({ status: "REVIEW" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await db.$executeRawUnsafe(`
      UPDATE senqor."RemediationJob" SET status = 'FAILED', "errorMessage" = $2, "updatedAt" = NOW() WHERE id = $1
    `, id, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
