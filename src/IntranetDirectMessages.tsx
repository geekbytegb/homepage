import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import {
  LockKeyhole,
  MessageCircle,
  Send,
  Trash2,
  UserRound,
} from "lucide-react";
import { db } from "./firebase";
import type {
  DirectConversation,
  DirectMessage,
  MemberIdentity,
} from "./types";

function messageTime(message: DirectMessage) {
  const date = message.createdAt?.toDate?.();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()))
    return "전송 중";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function IntranetDirectMessages({ user }: { user: User }) {
  const [identities, setIdentities] = useState<MemberIdentity[]>([]);
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const ownName = user.displayName || user.email || "구성원";

  useEffect(() => {
    if (!db) return;
    void setDoc(doc(db, "memberIdentities", user.uid), {
      uid: user.uid,
      displayName: ownName,
      updatedAt: serverTimestamp(),
    }).catch(() => setStatus("개인 대화 프로필을 준비하지 못했습니다."));
  }, [ownName, user.uid]);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      collection(db, "memberIdentities"),
      (snapshot) =>
        setIdentities(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as MemberIdentity,
          ),
        ),
      () => setStatus("대화 상대 목록을 불러오지 못했습니다."),
    );
  }, []);

  useEffect(() => {
    if (!db) return;
    const source = query(
      collection(db, "directConversations"),
      where("participants", "array-contains", user.uid),
    );
    return onSnapshot(
      source,
      (snapshot) =>
        setConversations(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as DirectConversation,
          ),
        ),
      () => setStatus("개인 대화 목록을 불러오지 못했습니다."),
    );
  }, [user.uid]);

  useEffect(() => {
    if (!db || !selectedId) {
      setMessages([]);
      return;
    }
    const source = query(
      collection(db, "directConversations", selectedId, "messages"),
      orderBy("createdAt", "desc"),
      limit(100),
    );
    return onSnapshot(
      source,
      (snapshot) => {
        setMessages(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }) as DirectMessage)
            .reverse(),
        );
        setStatus("");
      },
      () => setStatus("개인 메시지를 불러오지 못했습니다."),
    );
  }, [selectedId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, selectedId]);

  const contacts = useMemo(
    () =>
      identities
        .filter((identity) => identity.uid !== user.uid)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "ko-KR")),
    [identities, user.uid],
  );
  const identityMap = useMemo(
    () => new Map(identities.map((identity) => [identity.uid, identity])),
    [identities],
  );
  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedId,
  );
  const selectedOtherUid = selectedConversation?.participants.find(
    (uid) => uid !== user.uid,
  );
  const selectedName = selectedOtherUid
    ? identityMap.get(selectedOtherUid)?.displayName || "구성원"
    : "개인 대화";

  async function openConversation(contact: MemberIdentity) {
    if (!db) return;
    const participants = [user.uid, contact.uid].sort();
    const conversationId = participants.join("--");
    setStatus("");
    try {
      const reference = doc(db, "directConversations", conversationId);
      if (!conversations.some((item) => item.id === conversationId)) {
        await setDoc(reference, {
          participants,
          createdAt: serverTimestamp(),
        });
      }
      setSelectedId(conversationId);
    } catch {
      setStatus("개인 대화를 시작하지 못했습니다.");
    }
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!db || !selectedId || !text || text.length > 2000) return;
    setSending(true);
    setStatus("");
    try {
      await addDoc(
        collection(db, "directConversations", selectedId, "messages"),
        {
          authorUid: user.uid,
          authorName: ownName,
          text,
          createdAt: serverTimestamp(),
        },
      );
      setDraft("");
    } catch {
      setStatus("개인 메시지를 보내지 못했습니다.");
    } finally {
      setSending(false);
    }
  }

  async function removeMessage(messageId: string) {
    if (!db || !selectedId) return;
    try {
      await deleteDoc(
        doc(db, "directConversations", selectedId, "messages", messageId),
      );
      setConfirmDeleteId(null);
    } catch {
      setStatus("메시지를 삭제하지 못했습니다.");
    }
  }

  return (
    <section className="intranet-panel intranet-dm-panel">
      <div className="intranet-panel-heading">
        <span>DIRECT MESSAGES</span>
        <strong>{conversations.length}</strong>
      </div>
      <div className="dm-privacy-notice">
        <LockKeyhole size={15} />
        <p>
          팀 운영과 안전을 위해 관리자가 개인 대화를 열람할 수 있습니다.
          관리자가 대화 내용을 열 때마다 담당자·대상·시각이 변경 불가 활동
          기록에 남습니다.
        </p>
      </div>
      <div className="dm-shell">
        <aside className="dm-contact-list" aria-label="개인 대화 상대">
          <strong>구성원</strong>
          {contacts.length ? (
            contacts.map((contact) => {
              const conversationId = [user.uid, contact.uid].sort().join("--");
              const hasConversation = conversations.some(
                (item) => item.id === conversationId,
              );
              return (
                <button
                  className={selectedId === conversationId ? "selected" : ""}
                  key={contact.uid}
                  onClick={() => openConversation(contact)}
                  type="button"
                >
                  <span aria-hidden="true">
                    {contact.displayName.trim().slice(0, 1) || "G"}
                  </span>
                  <span>
                    <strong>{contact.displayName}</strong>
                    <small>
                      {hasConversation ? "대화 계속하기" : "새 대화"}
                    </small>
                  </span>
                </button>
              );
            })
          ) : (
            <p>인트라넷에 접속한 다른 구성원이 표시됩니다.</p>
          )}
        </aside>
        <div className="dm-main">
          {selectedId ? (
            <>
              <header className="dm-header">
                <UserRound size={17} />
                <strong>{selectedName}</strong>
                <span>1:1 대화</span>
              </header>
              <div className="dm-messages" aria-live="polite">
                {messages.length ? (
                  messages.map((message) => {
                    const own = message.authorUid === user.uid;
                    return (
                      <article
                        className={`chat-message ${own ? "own" : ""}`}
                        key={message.id}
                      >
                        {!own && (
                          <span className="chat-avatar" aria-hidden="true">
                            {message.authorName.trim().slice(0, 1) || "G"}
                          </span>
                        )}
                        <div className="chat-message-content">
                          {!own && <strong>{message.authorName}</strong>}
                          <div className="chat-bubble-row">
                            <p>{message.text}</p>
                            <time>{messageTime(message)}</time>
                          </div>
                          {own && (
                            <div className="chat-message-actions">
                              {confirmDeleteId === message.id ? (
                                <>
                                  <span>삭제할까요?</span>
                                  <button
                                    onClick={() => removeMessage(message.id)}
                                    type="button"
                                  >
                                    삭제
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    type="button"
                                  >
                                    취소
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteId(message.id)}
                                  type="button"
                                >
                                  <Trash2 size={12} /> 삭제
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="chat-empty">
                    <MessageCircle size={27} />
                    <strong>{selectedName}님과 대화를 시작하세요.</strong>
                  </div>
                )}
                <div ref={endRef} />
              </div>
              <form className="chat-composer" onSubmit={sendMessage}>
                <textarea
                  aria-label={`${selectedName}님에게 메시지 입력`}
                  maxLength={2000}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder={`${selectedName}님에게 메시지 보내기`}
                  rows={1}
                  value={draft}
                />
                <span>{draft.length}/2000</span>
                <button
                  aria-label="개인 메시지 보내기"
                  disabled={sending || !draft.trim()}
                  type="submit"
                >
                  <Send size={17} />
                </button>
              </form>
            </>
          ) : (
            <div className="chat-empty chat-empty-full">
              <UserRound size={30} />
              <strong>왼쪽에서 대화 상대를 선택하세요.</strong>
              <p>상대가 한 번 이상 인트라넷에 접속하면 목록에 표시됩니다.</p>
            </div>
          )}
        </div>
      </div>
      {status && (
        <p className="chat-status" role="status">
          {status}
        </p>
      )}
    </section>
  );
}
