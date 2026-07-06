"use client";

import type { ConversationPreview } from "@vaultchat/protocol";
import { formatMessageTime } from "@/lib/messages";

interface ChatListProps {
  conversations: ConversationPreview[];
  previews: Record<string, string>;
  unreadByPeer: Record<string, number>;
  search: string;
  onSearchChange: (v: string) => void;
  onSelect: (peerId: string, peerUsername: string) => void;
  onNewChat: () => void;
  loading: boolean;
}

export function ChatList({
  conversations,
  previews,
  unreadByPeer,
  search,
  onSearchChange,
  onSelect,
  onNewChat,
  loading,
}: ChatListProps) {
  const filtered = conversations.filter((c) =>
    c.peerUsername.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="vc-search">
        <input
          className="vc-search__input"
          placeholder="Search or start new chat"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && search.trim()) onNewChat();
          }}
        />
      </div>

      {loading ? (
        <div className="vc-loading">
          <div className="vc-spinner" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="vc-empty">
          <div className="vc-empty__icon">💬</div>
          <h2 className="vc-empty__title">No conversations yet</h2>
          <p className="vc-empty__text">
            Search for a username above to start an encrypted chat.
          </p>
        </div>
      ) : (
        <ul className="vc-chat-list">
          {filtered.map((c) => {
            const unread = unreadByPeer[c.peerId] ?? 0;
            return (
            <li key={c.peerId}>
              <button
                type="button"
                className={`vc-chat-item${unread > 0 ? " vc-chat-item--unread" : ""}`}
                onClick={() => onSelect(c.peerId, c.peerUsername)}
              >
                <div className="vc-chat-item__avatar">
                  {c.peerUsername[0]}
                </div>
                <div className="vc-chat-item__body">
                  <div className="vc-chat-item__name">@{c.peerUsername}</div>
                  <div className="vc-chat-item__preview">
                    {previews[c.peerId] ?? "🔒 Encrypted message"}
                  </div>
                </div>
                {unread > 0 ? (
                  <span className="vc-chat-item__unread" aria-label={`${unread} unread`}>
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : (
                  <div className="vc-chat-item__time">
                    {formatMessageTime(c.lastMessageAt)}
                  </div>
                )}
              </button>
            </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
