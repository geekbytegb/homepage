import { Timestamp } from "firebase/firestore";

export type BackupEntry = Record<string, unknown> & { id: string };
export type ContentBackupPayload = {
  schemaVersion: 3;
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
    events: BackupEntry[];
    channels: BackupEntry[];
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

function validateRecordConstraints(
  item: Record<string, unknown>,
  label: string,
  allowedFields: string[],
  stringLimits: Record<string, number>,
  options: {
    optionalHttps?: string[];
    requiredHttps?: string[];
    enums?: Record<string, string[]>;
    numberRanges?: Record<string, [number, number]>;
  } = {},
) {
  const allowed = new Set(allowedFields);
  const unexpected = Object.keys(item).find((key) => !allowed.has(key));
  if (unexpected)
    throw new Error(`${label}에 허용되지 않은 ${unexpected} 필드가 있습니다.`);
  Object.entries(stringLimits).forEach(([key, maxLength]) => {
    const value = item[key];
    if (typeof value === "string" && value.length > maxLength) {
      throw new Error(`${label}의 ${key} 값은 ${maxLength}자 이하여야 합니다.`);
    }
  });
  options.optionalHttps?.forEach((key) => {
    const value = item[key];
    if (typeof value === "string" && value && !/^https:\/\//i.test(value)) {
      throw new Error(`${label}의 ${key} 값은 HTTPS 주소여야 합니다.`);
    }
  });
  options.requiredHttps?.forEach((key) => {
    const value = item[key];
    if (typeof value !== "string" || !/^https:\/\//i.test(value)) {
      throw new Error(`${label}의 ${key} 값은 필수 HTTPS 주소여야 합니다.`);
    }
  });
  Object.entries(options.enums || {}).forEach(([key, values]) => {
    if (!values.includes(String(item[key]))) {
      throw new Error(`${label}의 ${key} 값이 허용 범위를 벗어났습니다.`);
    }
  });
  Object.entries(options.numberRanges || {}).forEach(([key, [min, max]]) => {
    const value = item[key];
    if (typeof value !== "number" || value < min || value > max) {
      throw new Error(`${label}의 ${key} 값은 ${min}~${max} 범위여야 합니다.`);
    }
  });
}

function validateEntriesConstraints(
  entries: BackupEntry[],
  label: string,
  fields: string[],
  stringLimits: Record<string, number>,
  options: Parameters<typeof validateRecordConstraints>[4] = {},
  optionalFields: string[] = ["order"],
) {
  entries.forEach((item, index) => {
    const itemLabel = `${label} ${index + 1}번 항목`;
    validateRecordConstraints(
      item,
      itemLabel,
      ["id", ...fields, ...optionalFields],
      stringLimits,
      options,
    );
    if ("order" in item) {
      const order = item.order;
      if (typeof order !== "number" || order < 1 || order > 100000) {
        throw new Error(`${itemLabel}의 order 값은 1~100000 범위여야 합니다.`);
      }
    }
  });
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
  validateEntries(payload.intranetContent.events, "내부 행사", [
    ["published", "boolean"],
    ["title", "string"],
    ["category", "string"],
    ["description", "string"],
    ["date", "string"],
    ["startTime", "string"],
    ["endTime", "string"],
    ["location", "string"],
    ["organizer", "string"],
    ["url", "string"],
  ]);
  validateEntries(payload.intranetContent.channels, "메신저 채널", [
    ["published", "boolean"],
    ["name", "string"],
    ["description", "string"],
    ["kind", "string"],
  ]);

  validateRecordConstraints(
    payload.site.overview,
    "사이트 소개",
    ["eyebrow", "headline", "description", "mission", "email"],
    {
      eyebrow: 100,
      headline: 300,
      description: 1000,
      mission: 1000,
      email: 254,
    },
  );
  validateRecordConstraints(
    payload.site.privacy,
    "개인정보 안내",
    ["published", "operator", "contact", "retention", "body"],
    { operator: 100, contact: 254, retention: 200, body: 20000 },
  );
  if (
    payload.site.privacy.published === true &&
    (String(payload.site.privacy.operator).length === 0 ||
      String(payload.site.privacy.contact).length === 0 ||
      String(payload.site.privacy.retention).length === 0 ||
      String(payload.site.privacy.body).length < 80)
  ) {
    throw new Error(
      "게시된 개인정보 안내는 운영 주체·문의처·보유 기간과 80자 이상의 전문이 필요합니다.",
    );
  }
  validateEntriesConstraints(
    payload.publicContent.history,
    "연혁",
    ["published", "year", "title", "description", "order"],
    { year: 40, title: 200, description: 5000 },
  );
  const noticeKeys = ["published", "title", "body", "date", "pinned"];
  const noticeLimits = { title: 200, body: 20000, date: 40 };
  validateEntriesConstraints(
    payload.publicContent.notices,
    "공지",
    noticeKeys,
    noticeLimits,
    {},
    [],
  );
  validateEntriesConstraints(
    payload.intranetContent.notices,
    "내부 공지",
    noticeKeys,
    noticeLimits,
    {},
    [],
  );
  validateEntriesConstraints(
    payload.publicContent.products,
    "제품",
    [
      "published",
      "name",
      "category",
      "description",
      "url",
      "status",
      "imageUrl",
      "imageAlt",
    ],
    {
      name: 200,
      category: 100,
      description: 5000,
      url: 2048,
      status: 100,
      imageUrl: 2048,
      imageAlt: 300,
    },
    { optionalHttps: ["url", "imageUrl"] },
  );
  payload.publicContent.products.forEach((item, index) => {
    if (item.published && item.imageUrl && !String(item.imageAlt).trim()) {
      throw new Error(
        `제품 ${index + 1}번 항목의 게시 이미지에는 imageAlt 값이 필요합니다.`,
      );
    }
  });
  validateEntriesConstraints(
    payload.publicContent.events,
    "행사",
    [
      "published",
      "title",
      "category",
      "description",
      "schedule",
      "format",
      "location",
      "capacity",
      "registrationDeadline",
      "registrationOpen",
    ],
    {
      title: 200,
      category: 100,
      description: 10000,
      schedule: 300,
      format: 100,
      location: 500,
      capacity: 100,
      registrationDeadline: 40,
    },
    {},
    ["order", "registrationDeadlineAt"],
  );
  validateEntriesConstraints(
    payload.intranetContent.resources,
    "내부 자료",
    ["published", "title", "description", "category", "url"],
    { title: 200, description: 5000, category: 100, url: 2048 },
    { requiredHttps: ["url"] },
  );
  validateEntriesConstraints(
    payload.intranetContent.projects,
    "프로젝트",
    ["published", "title", "summary", "owner", "status", "progress", "url"],
    { title: 200, summary: 10000, owner: 200, status: 20, url: 2048 },
    {
      optionalHttps: ["url"],
      enums: { status: ["planning", "active", "blocked", "done"] },
      numberRanges: { progress: [0, 100] },
    },
  );
  validateEntriesConstraints(
    payload.intranetContent.meetings,
    "회의 기록",
    ["published", "title", "date", "summary", "decisions", "nextActions"],
    {
      title: 200,
      date: 40,
      summary: 10000,
      decisions: 10000,
      nextActions: 10000,
    },
    {},
    [],
  );
  validateEntriesConstraints(
    payload.intranetContent.profiles,
    "구성원 프로필",
    ["published", "displayName", "role", "bio", "skills"],
    { displayName: 100, role: 200, bio: 5000, skills: 2000 },
  );
  validateEntriesConstraints(
    payload.intranetContent.events,
    "내부 행사",
    [
      "published",
      "title",
      "category",
      "description",
      "date",
      "startTime",
      "endTime",
      "location",
      "organizer",
      "url",
    ],
    {
      title: 200,
      category: 100,
      description: 10000,
      date: 40,
      startTime: 10,
      endTime: 10,
      location: 500,
      organizer: 200,
      url: 2048,
    },
    { optionalHttps: ["url"] },
  );
  validateEntriesConstraints(
    payload.intranetContent.channels,
    "메신저 채널",
    ["published", "name", "description", "kind"],
    { name: 80, description: 1000, kind: 20 },
    { enums: { kind: ["chat", "announcement"] } },
    ["order", "createdAt"],
  );
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
  if (
    !isRecord(value) ||
    (value.schemaVersion !== 2 && value.schemaVersion !== 3)
  )
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
    schemaVersion: 3,
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
      events:
        value.schemaVersion === 3
          ? backupEntries(value.intranetContent.events, "내부 행사")
          : [],
      channels:
        value.schemaVersion === 3
          ? backupEntries(value.intranetContent.channels, "메신저 채널")
          : [],
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
