import { test } from "node:test";
import assert from "node:assert/strict";
import { findOverdue } from "../watchdog";

const now = new Date("2026-01-01T12:00:00Z");

test("non-terminal run past deadline is overdue", () => {
  const runs = [{ id: "a", status: "RESCANNING", deadlineAt: new Date("2026-01-01T11:59:00Z") }];
  assert.deepEqual(findOverdue(runs, now).map(r => r.id), ["a"]);
});

test("non-terminal run before deadline is not overdue", () => {
  const runs = [{ id: "a", status: "RESCANNING", deadlineAt: new Date("2026-01-01T12:05:00Z") }];
  assert.equal(findOverdue(runs, now).length, 0);
});

test("terminal run past deadline is NOT reaped", () => {
  const runs = [{ id: "a", status: "VERIFIED", deadlineAt: new Date("2026-01-01T10:00:00Z") }];
  assert.equal(findOverdue(runs, now).length, 0, "terminal runs are final and never reaped");
});

test("mixed set returns only overdue non-terminal runs", () => {
  const runs = [
    { id: "a", status: "RUNNING", deadlineAt: new Date("2026-01-01T11:00:00Z") },   // overdue
    { id: "b", status: "FAILED", deadlineAt: new Date("2026-01-01T11:00:00Z") },    // terminal
    { id: "c", status: "COMPARING", deadlineAt: new Date("2026-01-01T13:00:00Z") }, // not yet
  ];
  assert.deepEqual(findOverdue(runs, now).map(r => r.id), ["a"]);
});
