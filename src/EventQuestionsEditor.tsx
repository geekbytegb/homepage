import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  serializeEventQuestions,
  type EventQuestion,
  type EventQuestionType,
} from "./eventQuestions";

function nextQuestionId(questions: EventQuestion[]) {
  let number = 1;
  while (questions.some((question) => question.id === `q-${number}`))
    number += 1;
  return `q-${number}`;
}

export function EventQuestionsEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  let questions: EventQuestion[] = [];
  let parseError = "";
  try {
    const parsed = value.trim() ? (JSON.parse(value) as unknown) : [];
    if (!Array.isArray(parsed)) throw new Error("INVALID_DRAFT");
    questions = parsed as EventQuestion[];
  } catch (error) {
    void error;
    parseError = "저장된 질문 편집 데이터를 읽지 못했습니다.";
  }

  function commit(next: EventQuestion[]) {
    onChange(serializeEventQuestions(next));
  }

  function update(index: number, patch: Partial<EventQuestion>) {
    commit(
      questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...patch } : question,
      ),
    );
  }

  function add() {
    if (questions.length >= 8) return;
    commit([
      ...questions,
      {
        id: nextQuestionId(questions),
        label: "",
        type: "short",
        required: false,
        options: [],
      },
    ]);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  }

  return (
    <section className="event-question-builder">
      <div className="event-question-heading">
        <div>
          <strong>행사별 추가 질문</strong>
          <p>단답·서술·선택·확인 질문을 최대 8개까지 구성할 수 있습니다.</p>
        </div>
        <button
          disabled={questions.length >= 8 || Boolean(parseError)}
          onClick={add}
          type="button"
        >
          <Plus size={14} /> 질문 추가
        </button>
      </div>
      {parseError && <p className="form-message error">{parseError}</p>}
      {questions.map((question, index) => (
        <article className="event-question-editor" key={question.id}>
          <div className="event-question-number">{index + 1}</div>
          <label>
            질문
            <input
              maxLength={120}
              onChange={(event) => update(index, { label: event.target.value })}
              placeholder="예: 참가 목적을 알려주세요"
              required
              value={question.label}
            />
          </label>
          <label>
            답변 방식
            <select
              onChange={(event) =>
                update(index, {
                  type: event.target.value as EventQuestionType,
                  options:
                    event.target.value === "choice"
                      ? question.options.length >= 2
                        ? question.options
                        : ["선택지 1", "선택지 2"]
                      : [],
                })
              }
              value={question.type}
            >
              <option value="short">단답형</option>
              <option value="long">서술형</option>
              <option value="choice">선택형</option>
              <option value="checkbox">확인형</option>
            </select>
          </label>
          {question.type === "choice" && (
            <label className="event-question-options">
              선택지 (한 줄에 하나)
              <textarea
                maxLength={809}
                onChange={(event) =>
                  update(index, {
                    options: event.target.value.split("\n").slice(0, 10),
                  })
                }
                rows={3}
                value={question.options.join("\n")}
              />
            </label>
          )}
          <label className="admin-check event-question-required">
            <input
              checked={question.required}
              onChange={(event) =>
                update(index, { required: event.target.checked })
              }
              type="checkbox"
            />
            필수 답변
          </label>
          <div className="event-question-actions">
            <button
              aria-label={`${index + 1}번째 질문을 위로 이동`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
              type="button"
            >
              <ArrowUp size={14} />
            </button>
            <button
              aria-label={`${index + 1}번째 질문을 아래로 이동`}
              disabled={index === questions.length - 1}
              onClick={() => move(index, 1)}
              type="button"
            >
              <ArrowDown size={14} />
            </button>
            <button
              aria-label={`${index + 1}번째 질문 삭제`}
              className="event-question-delete"
              onClick={() =>
                commit(
                  questions.filter(
                    (_, questionIndex) => questionIndex !== index,
                  ),
                )
              }
              type="button"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </article>
      ))}
      {!questions.length && !parseError && (
        <p className="event-question-empty">
          추가 질문이 없으면 기본 연락처와 신청 동기만 받습니다.
        </p>
      )}
    </section>
  );
}
