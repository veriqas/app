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

/**
 * Extract import specifiers from JS/TS, Python and Java source.
 *
 * Python and Java address modules by dotted name rather than by relative path,
 * so matching only `./x` style specifiers (the JS/TS shape) would supply the AI
 * with the affected file and nothing around it. Standard-library and third-party
 * names are extracted too, but resolution below only returns paths that exist
 * inside the workspace, so non-local modules simply drop out.
 */
export function extractLocalImports(content: string): string[] {
  const specs = new Set<string>();
  const patterns = [
    /import\s+(?:[\s\S]*?)\s+from\s+["'](\.[^"']+)["']/g, // ES  import ... from './x'
    /require\(\s*["'](\.[^"']+)["']\s*\)/g,                // CJS require('./x')
    /from\s+(\.[\w./]+)\s+import/g,                        // py  from .x import
    /^\s*from\s+([A-Za-z_][\w.]*)\s+import/gm,             // py  from pkg.mod import
    /^\s*import\s+([A-Za-z_][\w.]*)/gm,                    // py  import pkg.mod
    /^\s*import\s+(?:static\s+)?([a-z][\w.]*\.[A-Z]\w*)\s*;/gm, // java import com.foo.Bar;
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) specs.add(m[1]);
  }
  return [...specs];
}

/** Common source roots, so a dotted module/package name can be located. */
const SOURCE_ROOTS = ["", "src", "src/main/java", "src/main/python", "app", "lib"];

function resolveImport(dir: string, fromFile: string, spec: string): string | null {
  const baseDir = path.dirname(fromFile);

  // Relative specifier (JS/TS/Python): resolve against the importing file.
  if (spec.startsWith(".")) {
    const candidates = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", "/index.ts", "/index.js", "/__init__.py"];
    for (const ext of candidates) {
      const rel = path.normalize(path.join(baseDir, spec + ext)).replace(/\\/g, "/");
      if (readSafe(dir, rel) !== null) return rel;
    }
    return null;
  }

  // Dotted module/package name (Python `pkg.mod`, Java `com.foo.Bar`).
  const asPath = spec.replace(/\./g, "/");
  const candidates = [`${asPath}.py`, `${asPath}/__init__.py`, `${asPath}.java`, `${asPath}.ts`, `${asPath}.js`];
  for (const root of SOURCE_ROOTS) {
    for (const cand of candidates) {
      const rel = path.normalize(path.join(root, cand)).replace(/\\/g, "/");
      if (readSafe(dir, rel) !== null) return rel;
    }
  }
  // Java sources are often nested under a package path that repeats the source
  // root; also try resolving the dotted name relative to the importing file.
  for (const cand of candidates) {
    const rel = path.normalize(path.join(baseDir, cand)).replace(/\\/g, "/");
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

  // 4. Related tests. Each ecosystem names tests differently: JS/TS suffixes the
  // file, Python prefixes it (test_x.py), Java suffixes the class (XTest.java)
  // and keeps tests under src/test/java. Matching only the JS/TS shape would
  // hide the very tests that show how the crypto is exercised.
  const affectedBasenames = params.affectedFiles.map(f => path.basename(f).replace(/\.[^.]+$/, ""));
  const testDirs = (dir: string) => [
    `${dir}/__tests__`, dir, "test", "tests",
    dir.replace(/^src\/main\/java/, "src/test/java"),
    "src/test/java", "src/test/python",
  ];
  for (const f of files.filter(x => x.role === "AFFECTED").slice()) {
    const dir = path.dirname(f.filePath);
    for (const cand of testDirs(dir)) {
      for (const bn of affectedBasenames) {
        const names = [
          `${bn}.test.ts`, `${bn}.test.js`, `${bn}.spec.ts`, `${bn}_test.go`,
          `${bn}_test.py`, `test_${bn}.py`,                 // python: both conventions
          `${bn}Test.java`, `${bn}Tests.java`,               // java
        ];
        for (const n of names) add(`${cand}/${n}`, "TEST");
      }
    }
  }

  return { files, bytesUsed, truncated };
}
