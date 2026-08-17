import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson, repairJsonControlChars } from "../ai-client";

test("parses well-formed JSON unchanged", () => {
  const o = extractJson<{ a: number }>(`{"a":1}`);
  assert.equal(o.a, 1);
});

test("repairs raw newlines inside a patch payload's source content", () => {
  // What a model actually emits when returning a whole file in `newContent`.
  const raw = `{"changes":[{"filePath":"a.py","newContent":"import hashlib
def f():
    return 1
"}]}`;
  const o = extractJson<{ changes: { filePath: string; newContent: string }[] }>(raw);
  assert.equal(o.changes[0].filePath, "a.py");
  assert.ok(o.changes[0].newContent.includes("import hashlib"));
  assert.ok(o.changes[0].newContent.includes("\n"), "newlines are preserved, not lost");
});

test("repairs tabs and other control characters inside strings", () => {
  const o = extractJson<{ s: string }>("{\"s\":\"a\tb\"}");
  assert.equal(o.s, "a\tb");
});

test("does not disturb already-escaped sequences", () => {
  const o = extractJson<{ s: string }>(`{"s":"line1\nline2\t\\"quoted\\""}`);
  assert.equal(o.s, 'line1\nline2\t"quoted"');
});

test("leaves structural characters outside strings alone", () => {
  const repaired = repairJsonControlChars(`{\n  "a": 1\n}`);
  assert.equal(JSON.parse(repaired).a, 1);
});

test("still fails loudly when there is no JSON object at all", () => {
  assert.throws(() => extractJson("no json here"), /did not contain a JSON object/);
});
