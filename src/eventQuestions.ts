export type EventQuestionType = "short" | "long" | "choice" | "checkbox";
export type EventQuestion = {
  id: string;
  label: string;
  type: EventQuestionType;
  required: boolean;
  options: string[];
};
export type ApplicationAnswer = {
  id: string;
  label: string;
  value: string | boolean;
};

const questionTypes = new Set<EventQuestionType>([
  "short",
  "long",
  "choice",
  "checkbox",
]);

export function parseEventQuestions(raw?: string): EventQuestion[] {
  if (!raw?.trim()) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("행사 신청 질문 데이터가 올바른 JSON 형식이 아닙니다.");
  }
  if (!Array.isArray(value) || value.length > 8) {
    throw new Error("행사별 신청 질문은 최대 8개까지 등록할 수 있습니다.");
  }
  const ids = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(
        `행사 ${index + 1}번째 신청 질문 형식이 올바르지 않습니다.`,
      );
    }
    const candidate = item as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id : "";
    const label = typeof candidate.label === "string" ? candidate.label : "";
    const type = candidate.type as EventQuestionType;
    const required = candidate.required;
    const options = candidate.options;
    if (!/^[a-z0-9-]{1,40}$/.test(id) || ids.has(id)) {
      throw new Error(
        `행사 ${index + 1}번째 신청 질문 ID가 올바르지 않습니다.`,
      );
    }
    ids.add(id);
    if (!label.trim() || label.length > 120) {
      throw new Error(
        `행사 ${index + 1}번째 신청 질문 제목이 올바르지 않습니다.`,
      );
    }
    if (!questionTypes.has(type) || typeof required !== "boolean") {
      throw new Error(
        `행사 ${index + 1}번째 신청 질문 설정이 올바르지 않습니다.`,
      );
    }
    if (
      !Array.isArray(options) ||
      options.some((option) => typeof option !== "string")
    ) {
      throw new Error(
        `행사 ${index + 1}번째 신청 질문 선택지가 올바르지 않습니다.`,
      );
    }
    const normalizedOptions = options.map((option) => option.trim());
    if (
      normalizedOptions.length > 10 ||
      normalizedOptions.some((option) => !option || option.length > 80) ||
      (type === "choice" && normalizedOptions.length < 2)
    ) {
      throw new Error(
        `행사 ${index + 1}번째 선택형 질문은 2~10개의 선택지가 필요합니다.`,
      );
    }
    return {
      id,
      label: label.trim(),
      type,
      required,
      options: type === "choice" ? normalizedOptions : [],
    };
  });
}

export function serializeEventQuestions(questions: EventQuestion[]) {
  return questions.length ? JSON.stringify(questions) : "";
}

export function parseApplicationAnswers(raw?: string): ApplicationAnswer[] {
  if (!raw?.trim()) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is ApplicationAnswer =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as ApplicationAnswer).id === "string" &&
        typeof (item as ApplicationAnswer).label === "string" &&
        ["string", "boolean"].includes(
          typeof (item as ApplicationAnswer).value,
        ),
    );
  } catch {
    return [];
  }
}
