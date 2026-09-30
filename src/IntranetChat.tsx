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
} from "firebase/firestore";
import {
  Hash,
  Megaphone,
  MessageCircle,
  Search,
  Send,
  Settings2,
  Trash2,
} from "lucide-react";
import { db } from "./firebase";
import type { ChatChannel } from "./types";
import { useMessageUnread } from "./useMessageUnread";

type ChatMessage = {
  id: string;
  authorUid: string;
  authorName: string;
  text: string;
  createdAt?: { toDate: () => Date };
};

function messageDate(message: ChatMessage) {
  const date = message.createdAt?.toDate?.();
  return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
}

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function timeLabel(date: Date | null) {
  if (!date) return "전송 중";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function IntranetChat({
  channels,
  user,
  displayName,
  isAdmin,
  active = true,
  onManageChannels,
  onUnreadCountChange,
  embedded = false,
}: {
  channels: ChatChannel[];
  user: User;
  displayName: string;
  isAdmin: boolean;
  active?: boolean;
  onManageChannels: () => void;
  onUnreadCountChange?: (count: number) => void;
  embedded?: boolean;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [messageQuery, setMessageQuery] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const channelIds = useMemo(
    () => channels.map((channel) => channel.id),
    [channels],
  );
  const unreadIds = useMessageUnread(
    user.uid,
    "group",
    channelIds,
    active ? selectedId : "",
  );

  useEffect(() => {
    onUnreadCountChange?.(unreadIds.size);
  }, [onUnreadCountChange, unreadIds.size]);

  useEffect(() => {
    if (!channels.some((channel) => channel.id === selectedId)) {
      setSelectedId(channels[0]?.id || "");
    }
  }, [channels, selectedId]);

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedId) || null,
    [channels, selectedId],
  );
  const filteredMessages = useMemo(() => {
    const term = messageQuery.trim().toLocaleLowerCase("ko-KR");
    if (!term) return messages;
    return messages.filter((message) =>
      [message.authorName, message.text].some((value) =>
        value.toLocaleLowerCase("ko-KR").includes(term),
      ),
    );
  }, [messageQuery, messages]);

  useEffect(() => setMessageQuery(""), [selectedId]);

  useEffect(() => {
    if (!db || !selectedId) {
      setMessages([]);
      return;
    }
    setStatus("");
    const source = query(
      collection(db, "chatChannels", selectedId, "messages"),
      orderBy("createdAt", "desc"),
      limit(100),
    );
    return onSnapshot(
      source,
      (snapshot) => {
        setMessages(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }) as ChatMessage)
            .reverse(),
        );
        setStatus("");
      },
      () => setStatus("메시지를 불러오지 못했습니다."),
    );
  }, [selectedId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, selectedId]);

  const canPost = selectedChannel?.kind === "chat" || isAdmin;

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!db || !selectedChannel || !canPost || !text || text.length > 2000)
      return;
    setSending(true);
    setStatus("");
    try {
      await addDoc(
        collection(db, "chatChannels", selectedChannel.id, "messages"),
        {
          authorUid: user.uid,
          authorName: displayName,
          text,
          createdAt: serverTimestamp(),
        },
      );
      setDraft("");
    } catch {
      setStatus("메시지를 보내지 못했습니다.");
    } finally {
      setSending(false);
    }
  }

  async function deleteMessage(messageId: string) {
    if (!db || !selectedChannel) return;
    setStatus("");
    try {
      await deleteDoc(
        doc(db, "chatChannels", selectedChannel.id, "messages", messageId),
      );
      setConfirmDeleteId(null);
    } catch {
      setStatus("메시지를 삭제하지 못했습니다.");
    }
  }

  return (
    <section
      className={`intranet-panel intranet-chat-panel ${embedded ? "embedded" : ""}`}
    >
      <div className="intranet-panel-heading chat-panel-heading">
        <span>TEAM MESSENGER</span>
        <div>
          <strong>{channels.length}</strong>
          {isAdmin && (
            <button onClick={onManageChannels} type="button">
              <Settings2 size={14} /> 채널 관리
            </button>
          )}
        </div>
      </div>
      <div className="chat-shell">
        <aside className="chat-channel-rail" aria-label="메신저 채널">
          <div className="chat-rail-title">
            <MessageCircle size={17} />
            <span>GEEK BYTE</span>
          </div>
          {channels.length ? (
            channels.map((channel) => {
              const Icon = channel.kind === "announcement" ? Megaphone : Hash;
              return (
                <button
                  className={selectedId === channel.id ? "selected" : ""}
                  key={channel.id}
                  onClick={() => setSelectedId(channel.id)}
                  type="button"
                >
                  <Icon size={16} />
                  <span>
                    <strong>{channel.name}</strong>
                    {channel.description && (
                      <small>{channel.description}</small>
                    )}
                  </span>
                  {unreadIds.has(channel.id) && (
                    <em
                      className="messenger-unread-badge"
                      aria-label="읽지 않음"
                    >
                      새 메시지
                    </em>
                  )}
                </button>
              );
            })
          ) : (
            <p>게시된 채널이 없습니다.</p>
          )}
        </aside>
        <div className="chat-main">
          {selectedChannel ? (
            <>
              <header className="chat-header">
                <div>
                  {selectedChannel.kind === "announcement" ? (
                    <Megaphone size={18} />
                  ) : (
                    <Hash size={18} />
                  )}
                  <strong>{selectedChannel.name}</strong>
                </div>
                <label className="messenger-search">
                  <Search size={14} />
                  <input
                    aria-label={`${selectedChannel.name} 메시지 검색`}
                    onChange={(event) => setMessageQuery(event.target.value)}
                    placeholder="현재 채널 검색"
                    type="search"
                    value={messageQuery}
                  />
                </label>
                <span>
                  {selectedChannel.kind === "announcement"
                    ? "관리자 공지 전용"
                    : "구성원 대화 채널"}
                </span>
              </header>
              <div className="chat-messages" aria-live="polite">
                {filteredMessages.length ? (
                  filteredMessages.map((message, index) => {
                    const createdAt = messageDate(message);
                    const previousDate =
                      index > 0
                        ? messageDate(filteredMessages[index - 1])
                        : null;
                    const showDate =
                      createdAt &&
                      (!previousDate ||
                        createdAt.toDateString() !==
                          previousDate.toDateString());
                    const own = message.authorUid === user.uid;
                    return (
                      <div key={message.id}>
                        {showDate && (
                          <div className="chat-date-separator">
                            <span>{dateLabel(createdAt)}</span>
                          </div>
                        )}
                        <article className={`chat-message ${own ? "own" : ""}`}>
                          {!own && (
                            <span className="chat-avatar" aria-hidden="true">
                              {message.authorName.trim().slice(0, 1) || "G"}
                            </span>
                          )}
                          <div className="chat-message-content">
                            {!own && <strong>{message.authorName}</strong>}
                            <div className="chat-bubble-row">
                              <p>{message.text}</p>
                              <time>{timeLabel(createdAt)}</time>
                            </div>
                            {own && (
                              <div className="chat-message-actions">
                                {confirmDeleteId === message.id ? (
                                  <>
                                    <span>삭제할까요?</span>
                                    <button
                                      onClick={() => deleteMessage(message.id)}
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
                                    aria-label="내 메시지 삭제"
                                    onClick={() =>
                                      setConfirmDeleteId(message.id)
                                    }
                                    type="button"
                                  >
                                    <Trash2 size={12} /> 삭제
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </article>
                      </div>
                    );
                  })
                ) : messages.length ? (
                  <div className="chat-empty">
                    <Search size={28} />
                    <strong>검색 결과가 없습니다.</strong>
                    <p>작성자 이름이나 메시지 내용으로 다시 검색해 보세요.</p>
                  </div>
                ) : (
                  <div className="chat-empty">
                    <MessageCircle size={28} />
                    <strong>첫 메시지를 남겨보세요.</strong>
                    <p>최근 메시지 100개가 실시간으로 표시됩니다.</p>
                  </div>
                )}
                <div ref={messageEndRef} />
              </div>
              {status && (
                <p className="chat-status" role="status">
                  {status}
                </p>
              )}
              <form className="chat-composer" onSubmit={sendMessage}>
                {canPost ? (
                  <>
                    <textarea
                      aria-label={`${selectedChannel.name}에 메시지 입력`}
                      maxLength={2000}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendMessage();
                        }
                      }}
                      placeholder={`#${selectedChannel.name}에 메시지 보내기`}
                      rows={1}
                      value={draft}
                    />
                    <span>{draft.length}/2000</span>
                    <button
                      aria-label="메시지 보내기"
                      disabled={sending || !draft.trim()}
                      type="submit"
                    >
                      <Send size={17} />
                    </button>
                  </>
                ) : (
                  <p>이 채널은 관리자만 메시지를 게시할 수 있습니다.</p>
                )}
              </form>
            </>
          ) : (
            <div className="chat-empty chat-empty-full">
              <Hash size={30} />
              <strong>대화 채널을 준비 중입니다.</strong>
              <p>관리자가 채널을 게시하면 이곳에서 대화할 수 있습니다.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
