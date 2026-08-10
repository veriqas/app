import * as fs from "fs";
import * as path from "path";
import { CRYPTO_PATTERNS, SCANNABLE_EXTENSIONS, SKIP_DIRS } from "./crypto-patterns";
import type { CryptoPattern } from "./crypto-patterns";

export interface ScanFinding {
  filePath: string;
  lineNumber: number;
  lineText: string;
  pattern: CryptoPattern;
  matchedText: string;
}

export interface ScanResult {
  targetPath: string;
  filesScanned: number;
  filesSkipped: number;
  findings: ScanFinding[];
  durationMs: number;
  errors: string[];
}

function shouldScanFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SCANNABLE_EXTENSIONS.has(ext);
}

function shouldSkipDir(dirName: string): boolean {
  return SKIP_DIRS.has(dirName);
}

function scanFileContent(filePath: string, content: string): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const lines = content.split("\n");
  const seen = new Set<string>(); // deduplicate same pattern on same line

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment-heavy lines that are just docs about vulnerabilities
    const stripped = line.trim();
    if (stripped.startsWith("//") || stripped.startsWith("#") || stripped.startsWith("*")) {
      // Still scan comments — they may reveal algorithm usage
    }

    for (const pattern of CRYPTO_PATTERNS) {
      const match = pattern.regex.exec(line);
      if (match) {
        const key = `${i}:${pattern.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        findings.push({
          filePath,
          lineNumber: i + 1,
          lineText: line.trim().slice(0, 200),
          pattern,
          matchedText: match[0],
        });
      }
    }
  }

  return findings;
}

function walkDir(
  dirPath: string,
  results: { files: string[]; skipped: number; errors: string[] }
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    results.errors.push(`Cannot read dir: ${dirPath}`);
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) {
        results.skipped++;
        continue;
      }
      walkDir(path.join(dirPath, entry.name), results);
    } else if (entry.isFile()) {
      if (shouldScanFile(entry.name)) {
        results.files.push(path.join(dirPath, entry.name));
      } else {
        results.skipped++;
      }
    }
  }
}

export async function scanRepository(targetPath: string): Promise<ScanResult> {
  const start = Date.now();
  const errors: string[] = [];

  // Resolve and validate path
  const resolved = path.resolve(targetPath);
  if (!fs.existsSync(resolved)) {
    return {
      targetPath: resolved,
      filesScanned: 0,
      filesSkipped: 0,
      findings: [],
      durationMs: 0,
      errors: [`Path does not exist: ${resolved}`],
    };
  }

  const stat = fs.statSync(resolved);
  const isFile = stat.isFile();

  const fileList: string[] = [];
  let skipped = 0;

  if (isFile) {
    if (shouldScanFile(resolved)) {
      fileList.push(resolved);
    } else {
      skipped = 1;
    }
  } else {
    const walkResult = { files: fileList, skipped: 0, errors };
    walkDir(resolved, walkResult);
    skipped = walkResult.skipped;
  }

  const allFindings: ScanFinding[] = [];

  for (const filePath of fileList) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      errors.push(`Cannot read file: ${filePath}`);
      continue;
    }
    const findings = scanFileContent(filePath, content);
    allFindings.push(...findings);
  }

  return {
    targetPath: resolved,
    filesScanned: fileList.length,
    filesSkipped: skipped,
    findings: allFindings,
    durationMs: Date.now() - start,
    errors,
  };
}
