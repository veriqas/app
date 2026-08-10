/**
 * Resolves a scanner binary name to an absolute path.
 * Checks C:\tools first (where we install binaries), then falls through to PATH.
 */
import { existsSync } from "fs";
import { join } from "path";

const TOOLS_DIR = "C:\\tools";

export function resolveBinary(name: string): string {
  const win = join(TOOLS_DIR, `${name}.exe`);
  if (existsSync(win)) return win;
  const noExt = join(TOOLS_DIR, name);
  if (existsSync(noExt)) return noExt;
  return name; // fall back to PATH lookup
}
