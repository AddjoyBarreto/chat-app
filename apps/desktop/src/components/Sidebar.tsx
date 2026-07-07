import type { useVaultChat } from "@vaultchat/chat-react";
import { formatMessageTime } from "@vaultchat/client";

type Chat = ReturnType<typeof useVaultChat>;
type Nav = "home" | "friends";

export function Sidebar({ chat }: { nav: Nav; chat: Chat }) {
  const filtered = chat.conversations.filter((c) =>
    c.peerUsername.toLowerCase().includes(chat.search.toLowerCase())
  );

  return (
    <aside className="dc-sidebar">
      <header className="dc-sidebar__header">
        <input
          className="dc-sidebar__search"
          placeholder="Find or start a conversation"
          value={chat.search}
          onChange={(e) => chat.setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && chat.search.trim()) void chat.startNewChat();
          }}
        />
      </header>

      <div className="dc-sidebar__section">Direct Messages</div>

      <ul className="dc-dm-list">
        {filtered.length === 0 ? (
          <li className="dc-sidebar__empty">
            {chat.loading ? "Loading…" : "No conversations yet"}
          </li>
        ) : (
          filtered.map((c) => {
            const unread = chat.unreadByPeer[c.peerId] ?? 0;
            const active = chat.peer?.id === c.peerId;
            return (
              <li key={c.peerId}>
                <button
                  type="button"
                  className={`dc-dm-item${active ? " dc-dm-item--active" : ""}${unread > 0 ? " dc-dm-item--unread" : ""}`}
                  onClick={() => void chat.openConversation(c.peerId, c.peerUsername)}
                >
                  <span className="dc-dm-item__avatar">{c.peerUsername[0]}</span>
                  <span className="dc-dm-item__body">
                    <span className="dc-dm-item__name">@{c.peerUsername}</span>
                    <span className="dc-dm-item__preview">
                      {chat.previews[c.peerId] ?? "Encrypted message"}
                    </span>
                  </span>
                  {unread > 0 ? (
                    <span className="dc-dm-item__badge">{unread}</span>
                  ) : (
                    <span className="dc-dm-item__time">
                      {formatMessageTime(c.lastMessageAt)}
                    </span>
                  )}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
