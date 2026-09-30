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
          aria-selected={tab === "group"}
          className={tab === "group" ? "selected" : ""}
          onClick={() => setTab("group")}
          role="tab"
          type="button"
        >
          <Hash size={15} /> 그룹 채팅
          <span>{channels.length}</span>
        </button>
        <button
          aria-selected={tab === "direct"}
          className={tab === "direct" ? "selected" : ""}
          onClick={() => setTab("direct")}
          role="tab"
          type="button"
        >
          <UserRound size={15} /> 개인 대화
        </button>
      </div>
      <div className="messenger-tab-content" role="tabpanel">
        {tab === "group" ? (
          <IntranetChat
            channels={channels}
            user={user}
            displayName={displayName}
            isAdmin={isAdmin}
            onManageChannels={onManageChannels}
            embedded
          />
        ) : (
          <IntranetDirectMessages
            user={user}
            displayName={displayName}
            embedded
          />
        )}
      </div>
    </section>
  );
}
