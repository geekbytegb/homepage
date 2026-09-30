import { Timestamp } from "firebase/firestore";

export type BackupEntry = Record<string, unknown> & { id: string };
export type ContentBackupPayload = {
  schemaVersion: 2;
  exportedAt: string;
  site: {
    overview: Record<string, unknown>;
    privacy: Record<string, unknown>;
  };
  publicContent: {
    history: BackupEntry[];
    notices: BackupEntry[];
    products: BackupEntry[];
    events: BackupEntry[];
  };
  intranetContent: {
    notices: BackupEntry[];
    resources: BackupEntry[];
    projects: BackupEntry[];
    meetings: BackupEntry[];
    profiles: BackupEntry[];
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function backupEntries(value: unknown, label: string): BackupEntry[] {
  if (!Array.isArray(value)) throw new Error(`${label} 목록이 없습니다.`);
  const ids = new Set<string>();
  return value.map((item) => {
    if (!isRecord(item))
      throw new Error(`${label} 항목 형식이 잘못되었습니다.`);
    const id = item.id;
    if (
      typeof id !== "string" ||
      !id.trim() ||
      new TextEncoder().encode(id).length > 1500 ||
      id.includes("/")
    ) {
      throw new Error(`${label} 문서 ID가 올바르지 않습니다.`);
    }
    if (ids.has(id)) throw new Error(`${label}에 중복 문서 ID가 있습니다.`);
    ids.add(id);
    return item as BackupEntry;
  });
}

function requireBackupField(
  item: Record<string, unknown>,
  key: string,
  type: "string" | "boolean" | "number",
  label: string,
) {
  if (typeof item[key] !== type)
    throw new Error(`${label}의 ${key} 값이 올바르지 않습니다.`);
  if (type === "number" && !Number.isFinite(item[key]))
    throw new Error(`${label}의 ${key} 값이 올바르지 않습니다.`);
}

function validateBackupPayload(payload: ContentBackupPayload) {
  ["eyebrow", "headline", "description", "mission", "email"].forEach((key) =>
    requireBackupField(payload.site.overview, key, "string", "사이트 소개"),
  );
  requireBackupField(
    payload.site.privacy,
    "published",
    "boolean",
    "개인정보 안내",
  );
  ["operator", "contact", "retention", "body"].forEach((key) =>
    requireBackupField(payload.site.privacy, key, "string", "개인정보 안내"),
  );
  const validateEntries = (
    entries: BackupEntry[],
    label: string,
    fields: Array<[string, "string" | "boolean" | "number"]>,
  ) =>
    entries.forEach((item, index) => {
      fields.forEach(([key, type]) =>
        requireBackupField(item, key, type, `${label} ${index + 1}번 항목`),
      );
    });
  validateEntries(payload.publicContent.history, "연혁", [
    ["published", "boolean"],
    ["year", "string"],
    ["title", "string"],
    ["description", "string"],
    ["order", "number"],
  ]);
  const noticeFields: Array<[string, "string" | "boolean" | "number"]> = [
    ["published", "boolean"],
    ["title", "string"],
    ["body", "string"],
    ["date", "string"],
    ["pinned", "boolean"],
  ];
  validateEntries(payload.publicContent.notices, "공지", noticeFields);
  validateEntries(payload.intranetContent.notices, "내부 공지", noticeFields);
  validateEntries(payload.publicContent.products, "제품", [
    ["published", "boolean"],
    ["name", "string"],
    ["category", "string"],
    ["description", "string"],
    ["url", "string"],
    ["status", "string"],
    ["imageUrl", "string"],
    ["imageAlt", "string"],
  ]);
  validateEntries(payload.publicContent.events, "행사", [
    ["published", "boolean"],
    ["title", "string"],
    ["category", "string"],
    ["description", "string"],
    ["schedule", "string"],
    ["format", "string"],
    ["location", "string"],
    ["capacity", "string"],
    ["registrationDeadline", "string"],
    ["registrationOpen", "boolean"],
  ]);
  validateEntries(payload.intranetContent.resources, "내부 자료", [
    ["published", "boolean"],
    ["title", "string"],
    ["description", "string"],
    ["category", "string"],
    ["url", "string"],
  ]);
  validateEntries(payload.intranetContent.projects, "프로젝트", [
    ["published", "boolean"],
    ["title", "string"],
    ["summary", "string"],
    ["owner", "string"],
    ["status", "string"],
    ["progress", "number"],
    ["url", "string"],
  ]);
  validateEntries(payload.intranetContent.meetings, "회의 기록", [
    ["published", "boolean"],
    ["title", "string"],
    ["date", "string"],
    ["summary", "string"],
    ["decisions", "string"],
    ["nextActions", "string"],
  ]);
  validateEntries(payload.intranetContent.profiles, "구성원 프로필", [
    ["published", "boolean"],
    ["displayName", "string"],
    ["role", "string"],
    ["bio", "string"],
    ["skills", "string"],
  ]);
}

export function contentBackupCount(payload: ContentBackupPayload) {
  return [
    ...Object.values(payload.publicContent),
    ...Object.values(payload.intranetContent),
  ].reduce((sum, items) => sum + items.length, 0);
}

export function parseContentBackup(text: string): ContentBackupPayload {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("JSON 파일을 읽을 수 없습니다.");
  }
  if (!isRecord(value) || value.schemaVersion !== 2)
    throw new Error("지원하는 Geek Byte 백업 형식이 아닙니다.");
  if (
    typeof value.exportedAt !== "string" ||
    value.exportedAt.length > 64 ||
    !Number.isFinite(Date.parse(value.exportedAt))
  ) {
    throw new Error("백업 생성 시각이 올바르지 않습니다.");
  }
  if (
    !isRecord(value.site) ||
    !isRecord(value.site.overview) ||
    !isRecord(value.site.privacy) ||
    !isRecord(value.publicContent) ||
    !isRecord(value.intranetContent)
  ) {
    throw new Error("백업의 필수 영역이 누락되었습니다.");
  }
  const payload: ContentBackupPayload = {
    schemaVersion: 2,
    exportedAt: value.exportedAt,
    site: {
      overview: value.site.overview,
      privacy: value.site.privacy,
    },
    publicContent: {
      history: backupEntries(value.publicContent.history, "연혁"),
      notices: backupEntries(value.publicContent.notices, "공지"),
      products: backupEntries(value.publicContent.products, "제품"),
      events: backupEntries(value.publicContent.events, "행사"),
    },
    intranetContent: {
      notices: backupEntries(value.intranetContent.notices, "내부 공지"),
      resources: backupEntries(value.intranetContent.resources, "내부 자료"),
      projects: backupEntries(value.intranetContent.projects, "프로젝트"),
      meetings: backupEntries(value.intranetContent.meetings, "회의 기록"),
      profiles: backupEntries(value.intranetContent.profiles, "구성원 프로필"),
    },
  };
  if (contentBackupCount(payload) > 400)
    throw new Error("한 번에 복원할 수 있는 콘텐츠는 400개 이하입니다.");
  validateBackupPayload(payload);
  return payload;
}

export function restoreFirestoreValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(restoreFirestoreValue);
  if (!isRecord(value)) return value;
  if (
    value.type === "firestore/timestamp/1.0" &&
    typeof value.seconds === "number" &&
    typeof value.nanoseconds === "number"
  ) {
    return new Timestamp(value.seconds, value.nanoseconds);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      restoreFirestoreValue(child),
    ]),
  );
}
