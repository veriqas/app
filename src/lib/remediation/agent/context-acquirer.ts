// Targeted context acquisition: gather the MINIMUM relevant repository context for
// the AI stages — affected files, their local imports, package manifests, and
// related tests — within a strict token/byte budget. Never loads the whole repo.
// Reads only from the ephemeral workspace directory.

import * as fs from "fs";
import * as path from "path";

export interface ContextFile {
  filePath: string;         // repo-relative
  content: string;
  role: "AFFECTED" | "IMPORT" | "MANIFEST" | "TEST";
}

export interface ContextBundle {
  files: ContextFile[];
  bytesUsed: number;
  truncated: boolean;
}

const MANIFESTS = ["package.json", "pnpm-lock.yaml", "package-lock.json", "yarn.lock", "requirements.txt", "pyproject.toml", "cargo.toml", "cargo.lock", "go.mod", "go.sum", "pom.xml", "build.gradle"];
const MAX_FILE_BYTES = 24 * 1024;
const MAX_TOTAL_BYTES = 120 * 1024;

function readSafe(dir: string, rel: string, maxBytes = MAX_FILE_BYTES): string | null {
  try {
    const full = path.resolve(dir, rel);
    if (path.relative(path.resolve(dir), full).startsWith("..")) return null;
    const stat = fs.statSync(full);
    if (!stat.isFile()) return null;
    const buf = fs.readFileSync(full);
    return buf.slice(0, maxBytes).toString("utf-8");
  } catch { return null; }
}

/** Extract local (relative) import specifiers from JS/TS/Python source. */
export function extractLocalImports(content: string): string[] {
  const specs = new Set<string>();
  const patterns = [
    /import\s+(?:[\s\S]*?)\s+from\s+["'](\.[^"']+)["']/g, // ES import ... from './x'
    /require\(\s*["'](\.[^"']+)["']\s*\)/g,                // require('./x')
    /from\s+(\.[\w./]+)\s+import/g,                        // python from .x import
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) specs.add(m[1]);
  }
  return [...specs];
}

function resolveImport(dir: string, fromFile: string, spec: string): string | null {
  const baseDir = path.dirname(fromFile);
  const candidates = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", "/index.ts", "/index.js"];
  for (const ext of candidates) {
    const rel = path.normalize(path.join(baseDir, spec + ext)).replace(/\\/g, "/");
    if (readSafe(dir, rel) !== null) return rel;
  }
  return null;
}

export interface AcquireParams {
  workspaceDir: string;
  affectedFiles: string[];
  affectedDependencies: string[];
}

export function acquireContext(params: AcquireParams): ContextBundle {
  const files: ContextFile[] = [];
  let bytesUsed = 0;
  let truncated = false;
  const seen = new Set<string>();

  const add = (filePath: string, role: ContextFile["role"]): void => {
    const rel = filePath.replace(/\\/g, "/");
    if (seen.has(rel)) return;
    if (bytesUsed >= MAX_TOTAL_BYTES) { truncated = true; return; }
    const content = readSafe(params.workspaceDir, rel);
    if (content === null) return;
    seen.add(rel);
    bytesUsed += Buffer.byteLength(content, "utf-8");
    files.push({ filePath: rel, content, role });
  };

  // 1. Affected files (highest priority).
  for (const f of params.affectedFiles) add(f, "AFFECTED");

  // 2. Local imports of affected files.
  for (const f of files.filter(x => x.role === "AFFECTED").slice()) {
    for (const spec of extractLocalImports(f.content)) {
      const resolved = resolveImport(params.workspaceDir, f.filePath, spec);
      if (resolved) add(resolved, "IMPORT");
    }
  }

  // 3. Manifests (dependency context).
  for (const m of MANIFESTS) add(m, "MANIFEST");

  // 4. Related tests: any test file referencing an affected basename.
  const affectedBasenames = params.affectedFiles.map(f => path.basename(f).replace(/\.[^.]+$/, ""));
  for (const f of files.filter(x => x.role === "AFFECTED").slice()) {
    const dir = path.dirname(f.filePath);
    for (const cand of [`${dir}/__tests__`, dir, "test", "tests"]) {
      for (const bn of affectedBasenames) {
        for (const ext of [".test.ts", ".test.js", ".spec.ts", "_test.go", "_test.py"]) {
          add(`${cand}/${bn}${ext}`, "TEST");
        }
      }
    }
  }

  return { files, bytesUsed, truncated };
}
