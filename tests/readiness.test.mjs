import assert from "node:assert/strict";
import test from "node:test";
import { buildLaunchReadiness } from "../src/readiness.ts";

function input(overrides = {}) {
  return {
    firebaseConfigured: false,
    appCheckConfigured: false,
    privacyReady: false,
    contactEmailReady: false,
    administratorCount: 0,
    intranetMemberCount: 0,
    publicContentCount: 0,
    invalidEventDeadlineCount: 0,
    missingProductAltCount: 0,
    secureCustomDomain: false,
    ...overrides,
  };
}

test("launch readiness reports every required operating area", () => {
  const checks = buildLaunchReadiness(input());
  assert.equal(checks.length, 10);
  assert.deepEqual(
    checks.map((check) => check.id),
    [
      "firebase",
      "privacy",
      "contact",
      "administrator",
      "intranet-member",
      "public-content",
      "event-deadline",
      "product-alt",
      "app-check",
      "custom-domain-https",
    ],
  );
});

test("fully configured site passes every readiness check", () => {
  const checks = buildLaunchReadiness(
    input({
      firebaseConfigured: true,
      appCheckConfigured: true,
      privacyReady: true,
      contactEmailReady: true,
      administratorCount: 2,
      intranetMemberCount: 4,
      publicContentCount: 8,
      secureCustomDomain: true,
    }),
  );
  assert.ok(checks.every((check) => check.ready));
});

test("content quality issues point administrators to the correct editor", () => {
  const checks = buildLaunchReadiness(
    input({ invalidEventDeadlineCount: 2, missingProductAltCount: 1 }),
  );
  const deadline = checks.find((check) => check.id === "event-deadline");
  const productAlt = checks.find((check) => check.id === "product-alt");
  assert.equal(deadline.ready, false);
  assert.equal(deadline.target, "events");
  assert.match(deadline.detail, /2개/);
  assert.equal(productAlt.ready, false);
  assert.equal(productAlt.target, "products");
  assert.match(productAlt.detail, /1개/);
});
