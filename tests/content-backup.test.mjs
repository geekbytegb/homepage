import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase/firestore";
import {
  contentBackupCount,
  parseContentBackup,
  restoreFirestoreValue,
} from "../src/contentBackup.ts";

function validBackup() {
  return {
    schemaVersion: 2,
    exportedAt: "2026-09-30T00:00:00.000Z",
    site: {
      overview: {
        eyebrow: "IDEAS INTO IMPACT",
        headline: "Geek Byte",
        description: "Description",
        mission: "Mission",
        email: "",
      },
      privacy: {
        published: false,
        operator: "",
        contact: "",
        retention: "",
        body: "",
      },
    },
    publicContent: {
      history: [],
      notices: [],
      products: [],
      events: [],
    },
    intranetContent: {
      notices: [],
      resources: [],
      projects: [],
      meetings: [],
      profiles: [],
    },
  };
}

function profile(id) {
  return {
    id,
    published: true,
    displayName: "Member",
    role: "Developer",
    bio: "Bio",
    skills: "TypeScript",
  };
}

test("valid content backup parses and counts only content documents", () => {
  const backup = validBackup();
  backup.intranetContent.profiles.push(profile("member-1"));
  const parsed = parseContentBackup(JSON.stringify(backup));
  assert.equal(contentBackupCount(parsed), 1);
  assert.equal(parsed.intranetContent.profiles[0].id, "member-1");
});

test("backup parser rejects duplicate and unsafe document ids", () => {
  const duplicate = validBackup();
  duplicate.intranetContent.profiles.push(profile("member"), profile("member"));
  assert.throws(
    () => parseContentBackup(JSON.stringify(duplicate)),
    /중복 문서 ID/,
  );

  const unsafe = validBackup();
  unsafe.intranetContent.profiles.push(profile("members/member"));
  assert.throws(
    () => parseContentBackup(JSON.stringify(unsafe)),
    /문서 ID가 올바르지 않습니다/,
  );
});

test("backup parser rejects malformed fields and oversized restores", () => {
  const malformed = validBackup();
  malformed.intranetContent.profiles.push({
    ...profile("member"),
    published: "yes",
  });
  assert.throws(
    () => parseContentBackup(JSON.stringify(malformed)),
    /published 값이 올바르지 않습니다/,
  );

  const oversized = validBackup();
  oversized.intranetContent.profiles = Array.from({ length: 401 }, (_, index) =>
    profile(`member-${index}`),
  );
  assert.throws(
    () => parseContentBackup(JSON.stringify(oversized)),
    /400개 이하/,
  );
});

test("backup parser rejects an invalid export timestamp", () => {
  const backup = validBackup();
  backup.exportedAt = "not-a-date";
  assert.throws(
    () => parseContentBackup(JSON.stringify(backup)),
    /백업 생성 시각이 올바르지 않습니다/,
  );
});

test("serialized Firestore timestamps are restored as Timestamp values", () => {
  const restored = restoreFirestoreValue({
    registrationDeadlineAt: {
      type: "firestore/timestamp/1.0",
      seconds: 1_790_726_400,
      nanoseconds: 0,
    },
  });
  assert.ok(restored.registrationDeadlineAt instanceof Timestamp);
  assert.equal(restored.registrationDeadlineAt.seconds, 1_790_726_400);
});
