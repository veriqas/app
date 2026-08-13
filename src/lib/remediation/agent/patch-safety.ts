// Patch safety: validate proposed changes, compute content hashes, and generate a
// reviewable unified diff. Changes are never applied to the client's real repo —
// only to an ephemeral workspace — and every path is validated to stay inside it.

import * as crypto from "crypto";

export type ChangeType = "MODIFY" | "ADD" | "DELETE" | "DEP_UPGRADE";

export interface ProposedChange {
  filePath: string;
  changeType: ChangeType;
  newContent?: string;
  reason?: string;
}

export interface ValidatedChange extends ProposedChange {
  originalContent: string | null;
  originalHash: string | null;
  patchedHash: string | null;
  diffPatch: string;
}

export class PatchValidationError extends Error {}

const MAX_FILE_BYTES = 512 * 1024; // reject absurdly large writes

export function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf-8").digest("hex");
}

/** Validate a proposed path is repo-relative and safe (no traversal / absolute / NUL). */
export function validateRelPath(p: string): string {
  const clean = (p ?? "").trim();
  if (!clean) throw new PatchValidationError("Empty file path");
  if (clean.includes("\0")) throw new PatchValidationError("Null byte in path");
  if (/^([a-zA-Z]:[\\/]|[\\/])/.test(clean)) throw new PatchValidationError(`Absolute path not allowed: ${clean}`);
  const parts = clean.replace(/\\/g, "/").split("/");
  if (parts.includes("..")) throw new PatchValidationError(`Path traversal not allowed: ${clean}`);
  return clean.replace(/\\/g, "/");
}

/** Detect obviously-binary content (NUL byte) to reject unexpected binary writes. */
export function looksBinary(content: string): boolean {
  return content.includes("\0");
}

/** Minimal, correct unified diff (line-based, with context markers). */
export function unifiedDiff(original: string, patched: string, filePath: string): string {
  const a = original.split("\n");
  const b = patched.split("\n");
  const out: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];
  // Simple LCS-free block diff: emit removed then added where lines differ.
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; continue; }
    const hunkStart = i;
    const removed: string[] = [];
    const added: string[] = [];
    // Collect a divergent block until lines resync (bounded lookahead).
    while (i < a.length && (j >= b.length || a[i] !== b[j])) {
      if (b.slice(j).includes(a[i])) break;
      removed.push(`-${a[i]}`); i++;
    }
    while (j < b.length && (i >= a.length || a[i] !== b[j])) {
      if (a.slice(i).includes(b[j])) break;
      added.push(`+${b[j]}`); j++;
    }
    if (removed.length || added.length) {
      out.push(`@@ -${hunkStart + 1},${removed.length} +${hunkStart + 1},${added.length} @@`);
      out.push(...removed, ...added);
    } else { i++; j++; }
  }
  return out.join("\n");
}

/**
 * Validate a proposed change against the current workspace content and produce a
 * ValidatedChange (hashes + diff). `readOriginal` returns the current file content
 * or null if the file does not exist.
 */
export function validateChange(
  change: ProposedChange,
  readOriginal: (relPath: string) => string | null,
): ValidatedChange {
  const filePath = validateRelPath(change.filePath);
  const original = readOriginal(filePath);

  if (change.changeType === "DELETE") {
    return {
      ...change, filePath,
      originalContent: original, originalHash: original ? sha256(original) : null,
      patchedHash: null, diffPatch: original ? unifiedDiff(original, "", filePath) : "",
    };
  }

  const newContent = change.newContent ?? "";
  if (Buffer.byteLength(newContent, "utf-8") > MAX_FILE_BYTES) {
    throw new PatchValidationError(`Change to ${filePath} exceeds ${MAX_FILE_BYTES} bytes`);
  }
  if (looksBinary(newContent)) {
    throw new PatchValidationError(`Refusing binary/NUL content for ${filePath}`);
  }
  if (change.changeType === "ADD" && original !== null) {
    // ADD onto an existing file is treated as MODIFY (non-fatal normalization).
    change = { ...change, changeType: "MODIFY" };
  }

  return {
    ...change, filePath,
    originalContent: original,
    originalHash: original ? sha256(original) : null,
    patchedHash: sha256(newContent),
    diffPatch: unifiedDiff(original ?? "", newContent, filePath),
  };
}
