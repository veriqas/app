import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_BUNDLES, can, canAny, primaryRole, FALLBACK_ROLE,
  type SessionPermissions, type RoleName,
} from "../permissions";

const sp = (role: RoleName): SessionPermissions =>
  ({ permissions: new Set(ROLE_BUNDLES[role]), roles: [role], isFallback: false });

test("a reviewer sees only their own work", () => {
  const r = sp("REVIEWER");
  assert.ok(can(r, "cases:read:assigned"));
  assert.ok(!can(r, "cases:read:all"), "must not browse every case");
  assert.ok(!can(r, "actions:read:all"));
  assert.ok(!can(r, "reporting:trends"));
  assert.ok(!can(r, "admin:users"));
});

test("an analyst can find and fix, but not decide the risk is acceptable", () => {
  const a = sp("ANALYST");
  assert.ok(can(a, "discovery:run"));
  assert.ok(can(a, "cases:remediate"));
  assert.ok(can(a, "reporting:trends"), "operational reporting is theirs");
  assert.ok(!can(a, "reporting:board"), "board reporting is a leadership view");
  assert.ok(!can(a, "governance:accept-risk"), "remediating and accepting must be separate hands");
  assert.ok(!can(a, "admin:users"));
  assert.ok(!can(a, "admin:config"));
});

test("a manager adds board reporting and risk acceptance, but not administration", () => {
  const m = sp("MANAGER");
  assert.ok(can(m, "reporting:board"));
  assert.ok(can(m, "governance:accept-risk"));
  assert.ok(!can(m, "admin:users"));
  assert.ok(!can(m, "admin:config"));
  assert.ok(!can(m, "admin:audit"));
});

test("an administrator holds every permission", () => {
  const ad = sp("ADMIN");
  for (const p of ROLE_BUNDLES.MANAGER) assert.ok(can(ad, p));
  assert.ok(can(ad, "admin:users") && can(ad, "admin:config") && can(ad, "admin:audit"));
});

test("bundles are strictly cumulative", () => {
  const order: RoleName[] = ["REVIEWER", "ANALYST", "MANAGER", "ADMIN"];
  for (let i = 1; i < order.length; i++) {
    for (const p of ROLE_BUNDLES[order[i - 1]]) {
      assert.ok(ROLE_BUNDLES[order[i]].includes(p), `${order[i]} must retain ${p}`);
    }
  }
});

test("no role means the minimum bundle, never the maximum", () => {
  const none: SessionPermissions = { permissions: new Set(ROLE_BUNDLES[FALLBACK_ROLE]), roles: [], isFallback: true };
  assert.equal(FALLBACK_ROLE, "REVIEWER");
  assert.ok(!can(none, "admin:users"));
  assert.ok(!can(none, "cases:read:all"));
  assert.ok(!can(none, "reporting:board"));
  assert.equal(primaryRole(none), "REVIEWER");
});

test("canAny covers the case-detail rule", () => {
  assert.ok(canAny(sp("REVIEWER"), "cases:read:all", "cases:read:assigned"));
  assert.ok(canAny(sp("ANALYST"), "cases:read:all", "cases:read:assigned"));
});

test("primaryRole reports the highest role held", () => {
  assert.equal(primaryRole({ permissions: new Set(), roles: ["ANALYST", "ADMIN"], isFallback: false }), "ADMIN");
  assert.equal(primaryRole({ permissions: new Set(), roles: ["REVIEWER"], isFallback: false }), "REVIEWER");
});
