import { simpleGit } from "simple-git";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";

/**
 * Clone a public GitHub repo to a temp directory.
 * Returns the local path. Caller must call cleanup() when done.
 */
export async function cloneRepo(repoUrl: string): Promise<{ dir: string; cleanup: () => void }> {
  const id = `senqor-scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = path.join(os.tmpdir(), id);
  fs.mkdirSync(dir, { recursive: true });

  const git = simpleGit();
  await git.clone(repoUrl, dir, ["--depth", "1", "--single-branch"]);

  const cleanup = () => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  };

  return { dir, cleanup };
}

/** Walk a directory tree and yield all file paths matching an extension list. */
export function* walkFiles(dir: string, exts: string[]): Generator<string> {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", "dist", "build", "__pycache__", ".venv", "vendor"].includes(entry.name)) continue;
      yield* walkFiles(full, exts);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (exts.length === 0 || exts.includes(ext)) yield full;
    }
  }
}
