import { useRef, useState, type KeyboardEvent } from "react";
import type { User } from "firebase/auth";
import { Hash, MessageCircle, Settings2, UserRound } from "lucide-react";
import { IntranetChat } from "./IntranetChat";
import { IntranetDirectMessages } from "./IntranetDirectMessages";
import type { ChatChannel } from "./types";

export function IntranetMessenger({
  channels,
  user,
  displayName,
  isAdmin,
  onManageChannels,
}: {
  channels: ChatChannel[];
  user: User;
  displayName: string;
  isAdmin: boolean;
  onManageChannels: () => void;
}) {
  const [tab, setTab] = useState<"group" | "direct">("group");
  const [groupUnread, setGroupUnread] = useState(0);
  const [directUnread, setDirectUnread] = useState(0);
  const groupTabRef = useRef<HTMLButtonElement>(null);
  const directTabRef = useRef<HTMLButtonElement>(null);

  function selectTab(nextTab: "group" | "direct", moveFocus = false) {
    setTab(nextTab);
    if (moveFocus) {
      const nextRef = nextTab === "group" ? groupTabRef : directTabRef;
      requestAnimationFrame(() => nextRef.current?.focus());
    }
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextTab =
      event.key === "Home"
        ? "group"
        : event.key === "End"
          ? "direct"
          : tab === "group"
            ? "direct"
            : "group";
    selectTab(nextTab, true);
  }

  return (
    <section className="intranet-panel intranet-messenger-panel">
      <div className="messenger-toolbar">
        <div className="messenger-title">
          <MessageCircle size={17} />
          <span>
            <strong>팀 메신저</strong>
            <small>채널과 1:1 대화를 한곳에서 확인하세요.</small>
          </span>
        </div>
        <div className="messenger-tabs" role="tablist" aria-label="메신저 유형">
          <button
            aria-controls="messenger-group-panel"
            aria-selected={tab === "group"}
            className={tab === "group" ? "selected" : ""}
            id="messenger-group-tab"
            onClick={() => selectTab("group")}
            onKeyDown={handleTabKeyDown}
            ref={groupTabRef}
            role="tab"
            tabIndex={tab === "group" ? 0 : -1}
            type="button"
          >
            <Hash size={15} /> 그룹 채팅
            <span>{groupUnread > 0 ? groupUnread : channels.length}</span>
          </button>
          <button
            aria-controls="messenger-direct-panel"
            aria-selected={tab === "direct"}
            className={tab === "direct" ? "selected" : ""}
            id="messenger-direct-tab"
            onClick={() => selectTab("direct")}
            onKeyDown={handleTabKeyDown}
            ref={directTabRef}
            role="tab"
            tabIndex={tab === "direct" ? 0 : -1}
            type="button"
          >
            <UserRound size={15} /> 개인 대화
            {directUnread > 0 && <span>{directUnread}</span>}
          </button>
        </div>
        {isAdmin && tab === "group" && (
          <button onClick={onManageChannels} type="button">
            <Settings2 size={14} /> 채널 관리
          </button>
        )}
      </div>
      <div
        aria-labelledby="messenger-group-tab"
        className="messenger-tab-content"
        hidden={tab !== "group"}
        id="messenger-group-panel"
        role="tabpanel"
      >
        <IntranetChat
          active={tab === "group"}
          channels={channels}
          user={user}
          displayName={displayName}
          isAdmin={isAdmin}
          onManageChannels={onManageChannels}
          onUnreadCountChange={setGroupUnread}
          embedded
        />
      </div>
      <div
        aria-labelledby="messenger-direct-tab"
        className="messenger-tab-content"
        hidden={tab !== "direct"}
        id="messenger-direct-panel"
        role="tabpanel"
      >
        <IntranetDirectMessages
          active={tab === "direct"}
          user={user}
          displayName={displayName}
          onUnreadCountChange={setDirectUnread}
          embedded
        />
      </div>
    </section>
  );
}
