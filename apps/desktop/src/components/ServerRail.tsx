import type { SettablePresenceStatus } from "@vaultchat/protocol";
import { UserRailPanel } from "./UserRailPanel";

type RailNav = "home" | "friends";

export interface GroupRailItem {
  id: string;
  name: string;
}

export function ServerRail({
  rail,
  activeGroupId,
  groups,
  onHome,
  onFriends,
  onSelectGroup,
  onReorderGroup,
  username,
  unread,
  friendsUnread,
  ownPresence,
  onPresenceChange,
  presenceDisabled,
  onOpenSettings,
}: {
  rail: RailNav;
  activeGroupId: string | null;
  groups: GroupRailItem[];
  onHome: () => void;
  onFriends: () => void;
  onSelectGroup: (groupId: string, name: string) => void;
  onReorderGroup: (fromIndex: number, toIndex: number) => void;
  username: string;
  unread: number;
  friendsUnread: number;
  ownPresence: SettablePresenceStatus;
  onPresenceChange: (status: SettablePresenceStatus) => void;
  presenceDisabled?: boolean;
  onOpenSettings: () => void;
}) {
  const dragIndex = { current: -1 };

  return (
    <nav className="dc-rail" aria-label="App navigation">
      <button
        type="button"
        className={`dc-rail__btn dc-rail__btn--home${rail === "home" && !activeGroupId ? " dc-rail__btn--active" : ""}`}
        onClick={onHome}
        title="Direct Messages"
        aria-label="Direct Messages"
      >
        <DmIcon />
        {unread > 0 && <span className="dc-rail__badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      <button
        type="button"
        className={`dc-rail__btn${rail === "friends" && !activeGroupId ? " dc-rail__btn--active" : ""}`}
        onClick={onFriends}
        title="Friends"
        aria-label="Friends"
      >
        <FriendsIcon />
        {friendsUnread > 0 && (
          <span className="dc-rail__badge">{friendsUnread > 9 ? "9+" : friendsUnread}</span>
        )}
      </button>

      {groups.length > 0 && <div className="dc-rail__divider" aria-hidden />}

      <div className="dc-rail__groups">
        {groups.map((g, index) => (
          <button
            key={g.id}
            type="button"
            draggable
            className={`dc-rail__group${activeGroupId === g.id ? " dc-rail__group--active" : ""}`}
            title={g.name}
            aria-label={g.name}
            onClick={() => onSelectGroup(g.id, g.name)}
            onDragStart={() => {
              dragIndex.current = index;
            }}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex.current >= 0 && dragIndex.current !== index) {
                onReorderGroup(dragIndex.current, index);
              }
              dragIndex.current = -1;
            }}
            onDragEnd={() => {
              dragIndex.current = -1;
            }}
          >
            {g.name[0]?.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="dc-rail__spacer" />

      <div className="dc-rail__footer">
        <UserRailPanel
          username={username}
          presence={ownPresence}
          onPresenceChange={onPresenceChange}
          onOpenSettings={onOpenSettings}
          disabled={presenceDisabled}
        />
      </div>
    </nav>
  );
}

function DmIcon() {
  return (
    <svg className="dc-rail__svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z" />
    </svg>
  );
}

function FriendsIcon() {
  return (
    <svg className="dc-rail__svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  );
}
