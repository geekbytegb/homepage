import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { Eye, LockKeyhole, MessageCircle } from "lucide-react";
import { db } from "./firebase";
import type {
  DirectConversation,
  DirectMessage,
  MemberIdentity,
} from "./types";

function timestamp(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime())
      ? date
      : null;
  }
  return null;
}

export function AdminDirectMessages({ user }: { user: User }) {
  const [identities, setIdentities] = useState<MemberIdentity[]>([]);
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [status, setStatus] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;
    const unsubscribeIdentities = onSnapshot(
      collection(db, "memberIdentities"),
      (snapshot) =>
        setIdentities(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as MemberIdentity,
          ),
        ),
      () => setStatus("구성원 표시 이름을 불러오지 못했습니다."),
    );
    const unsubscribeConversations = onSnapshot(
      collection(db, "directConversations"),
      (snapshot) =>
        setConversations(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as DirectConversation,
          ),
        ),
      () => setStatus("개인 대화 목록을 불러오지 못했습니다."),
    );
    return () => {
      unsubscribeIdentities();
      unsubscribeConversations();
    };
  }, []);

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
      () => {
        setMessages([]);
        setStatus("열람 권한이 만료됐습니다. 대화를 다시 열어 주세요.");
      },
    );
  }, [selectedId]);

  const identityMap = useMemo(
    () => new Map(identities.map((identity) => [identity.uid, identity])),
    [identities],
  );
  const sortedConversations = useMemo(
    () =>
      [...conversations].sort(
        (a, b) =>
          (timestamp(b.createdAt)?.getTime() || 0) -
          (timestamp(a.createdAt)?.getTime() || 0),
      ),
    [conversations],
  );

  function participantLabel(conversation: DirectConversation) {
    return conversation.participants
      .map(
        (uid) =>
          identityMap.get(uid)?.displayName || `구성원 ${uid.slice(0, 6)}`,
      )
      .join(" ↔ ");
  }

  async function openConversation(conversation: DirectConversation) {
    if (!db || !user.email) return;
    setOpeningId(conversation.id);
    setSelectedId("");
    setStatus("");
    try {
      const batch = writeBatch(db);
      const auditReference = doc(collection(db, "adminAuditLogs"));
      const participantNames = participantLabel(conversation);
      batch.set(auditReference, {
        action: "dm.view",
        target: `directConversations/${conversation.id}`,
        details: `개인 대화 열람: ${participantNames}`,
        actor: user.email,
        createdAt: serverTimestamp(),
      });
      batch.set(
        doc(db, "directMessageAccess", `${user.uid}_${conversation.id}`),
        {
          actorUid: user.uid,
          conversationId: conversation.id,
          auditId: auditReference.id,
          createdAt: serverTimestamp(),
          expiresAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000),
        },
      );
      await batch.commit();
      setSelectedId(conversation.id);
      setStatus(
        "열람 사실이 활동 기록에 저장됐습니다. 접근 권한은 5분간 유효합니다.",
      );
    } catch {
      setStatus("감사 기록을 남기지 못해 대화를 열 수 없습니다.");
    } finally {
      setOpeningId(null);
    }
  }

  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedId,
  );

  return (
    <div className="admin-dm-audit">
      <div className="admin-dm-warning">
        <LockKeyhole size={20} />
        <div>
          <strong>개인 대화 열람은 모두 기록됩니다.</strong>
          <p>
            대화를 열 때 변경 불가 활동 기록을 먼저 저장하고 5분 동안만 내용을
            읽습니다. 정당한 운영·안전 목적이 있을 때만 확인하세요.
          </p>
        </div>
      </div>
      <div className="admin-dm-layout">
        <section className="admin-list admin-dm-list">
          <div className="admin-list-heading">
            <div>
              <span>DIRECT MESSAGE AUDIT</span>
              <h2>개인 대화 목록</h2>
            </div>
            <strong>{sortedConversations.length}</strong>
          </div>
          {sortedConversations.length ? (
            sortedConversations.map((conversation) => (
              <article className="admin-row" key={conversation.id}>
                <div>
                  <h3>{participantLabel(conversation)}</h3>
                  <p>
                    생성{" "}
                    {timestamp(conversation.createdAt)?.toLocaleString(
                      "ko-KR",
                    ) || "시간 확인 중"}
                  </p>
                </div>
                <div className="admin-row-actions">
                  <button
                    disabled={openingId === conversation.id}
                    onClick={() => openConversation(conversation)}
                    type="button"
                  >
                    <Eye size={16} />
                    {openingId === conversation.id ? "기록 중" : "기록 후 열람"}
                  </button>
                </div>
              </article>
            ))
          ) : (
            <p className="admin-empty">아직 생성된 개인 대화가 없습니다.</p>
          )}
        </section>
        <section className="admin-dm-viewer">
          {selectedConversation ? (
            <>
              <header>
                <span>열람 중</span>
                <h2>{participantLabel(selectedConversation)}</h2>
              </header>
              <div>
                {messages.length ? (
                  messages.map((message) => (
                    <article key={message.id}>
                      <strong>{message.authorName}</strong>
                      <p>{message.text}</p>
                      <time>
                        {timestamp(message.createdAt)?.toLocaleString(
                          "ko-KR",
                        ) || "전송 중"}
                      </time>
                    </article>
                  ))
                ) : (
                  <p className="admin-empty">표시할 메시지가 없습니다.</p>
                )}
              </div>
            </>
          ) : (
            <div className="admin-dm-placeholder">
              <MessageCircle size={30} />
              <p>대화를 선택하면 감사 기록을 저장한 뒤 내용이 표시됩니다.</p>
            </div>
          )}
        </section>
      </div>
      {status && (
        <p className="admin-message" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
