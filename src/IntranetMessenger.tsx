import { useState } from "react";
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

  return (
    <section className="intranet-panel intranet-messenger-panel">
      <div className="intranet-panel-heading messenger-panel-heading">
        <span>
          <MessageCircle size={15} /> TEAM MESSENGER
        </span>
        {isAdmin && tab === "group" && (
          <button onClick={onManageChannels} type="button">
            <Settings2 size={14} /> 채널 관리
          </button>
        )}
      </div>
      <div className="messenger-tabs" role="tablist" aria-label="메신저 유형">
        <button
          aria-controls="messenger-group-panel"
          aria-selected={tab === "group"}
          className={tab === "group" ? "selected" : ""}
          id="messenger-group-tab"
          onClick={() => setTab("group")}
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
          onClick={() => setTab("direct")}
          role="tab"
          tabIndex={tab === "direct" ? 0 : -1}
          type="button"
        >
          <UserRound size={15} /> 개인 대화
          {directUnread > 0 && <span>{directUnread}</span>}
        </button>
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
