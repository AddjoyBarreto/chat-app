import type { useFriends, useVaultChat } from "@vaultchat/chat-react";
import { PresenceDot } from "@vaultchat/chat-react";
import { formatMessageTime } from "@vaultchat/client";
import { useMemo } from "react";

type Chat = ReturnType<typeof useVaultChat>;
type Friends = ReturnType<typeof useFriends>;
type RailNav = "home" | "friends";
type HubView = "friends" | "groups";

function DmList({
  conversations,
  chat,
  friends,
  emptyText,
}: {
  conversations: Chat["conversations"];
  chat: Chat;
  friends: Friends;
  emptyText: string;
}) {
  if (conversations.length === 0) {
    return <li className="dc-sidebar__empty">{chat.loading ? "Loading…" : emptyText}</li>;
  }

  return (
    <>
      {conversations.map((c) => {
        const unread = chat.unreadByPeer[c.peerId] ?? 0;
        const active = chat.peer?.id === c.peerId;
        return (
          <li key={c.peerId}>
            <button
              type="button"
              className={`dc-dm-item${active ? " dc-dm-item--active" : ""}${unread > 0 ? " dc-dm-item--unread" : ""}`}
              onClick={() => void chat.openConversation(c.peerId, c.peerUsername)}
            >
              <span className="dc-dm-item__avatar-wrap">
                <span className="dc-dm-item__avatar">{c.peerUsername[0]}</span>
                <PresenceDot
                  status={friends.getPresence(c.peerId)}
                  className="dc-dm-item__status"
                />
              </span>
              <span className="dc-dm-item__body">
                <span className="dc-dm-item__name">{c.peerUsername}</span>
                <span className="dc-dm-item__preview">
                  {chat.previews[c.peerId] ?? "Encrypted message"}
                </span>
              </span>
              {unread > 0 ? (
                <span className="dc-dm-item__badge">{unread}</span>
              ) : (
                <span className="dc-dm-item__time">{formatMessageTime(c.lastMessageAt)}</span>
              )}
            </button>
          </li>
        );
      })}
    </>
  );
}

export function Sidebar({
  rail,
  hubView,
  chat,
  friends,
  onHubView,
  onGoHome,
}: {
  rail: RailNav;
  hubView: HubView;
  chat: Chat;
  friends: Friends;
  onHubView: (view: HubView) => void;
  onGoHome: () => void;
}) {
  const friendIds = useMemo(
    () => new Set(friends.friends.map((f) => f.userId)),
    [friends.friends]
  );

  const conversations = useMemo(() => {
    const base =
      rail === "friends"
        ? chat.conversations.filter((c) => friendIds.has(c.peerId))
        : chat.conversations;
    const q = chat.search.toLowerCase();
    if (!q) return base;
    return base.filter((c) => c.peerUsername.toLowerCase().includes(q));
  }, [rail, chat.conversations, chat.search, friendIds]);

  const friendsHubActive = rail === "friends" && hubView === "friends" && !chat.peer;
  const groupsHubActive = rail === "friends" && hubView === "groups" && !chat.peer;

  return (
    <aside className="dc-sidebar">
      <header className="dc-sidebar__header">
        <button type="button" className="dc-sidebar__title-btn" onClick={onGoHome}>
          VaultChat
        </button>
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

      <nav className="dc-sidebar__nav" aria-label="Sidebar">
        <button
          type="button"
          className={`dc-sidebar__nav-item${friendsHubActive ? " dc-sidebar__nav-item--active" : ""}`}
          onClick={() => onHubView("friends")}
        >
          <span className="dc-sidebar__nav-icon">
            <FriendsNavIcon />
          </span>
          Friends
        </button>
        <button
          type="button"
          className={`dc-sidebar__nav-item${groupsHubActive ? " dc-sidebar__nav-item--active" : ""}`}
          onClick={() => onHubView("groups")}
        >
          <span className="dc-sidebar__nav-icon">
            <GroupsNavIcon />
          </span>
          Groups
        </button>
      </nav>

      <div className="dc-sidebar__section">
        <span>Direct Messages</span>
      </div>

      <ul className="dc-dm-list">
        <DmList
          chat={chat}
          friends={friends}
          conversations={conversations}
          emptyText={
            rail === "friends"
              ? friends.friends.length === 0
                ? "Add friends to start chatting"
                : "No friend conversations yet"
              : "No conversations yet"
          }
        />
      </ul>
    </aside>
  );
}

function FriendsNavIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  );
}

function GroupsNavIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}
