import type { useCallSession, useFriends, useVaultChat } from "@vaultchat/chat-react";
import { useGroupRailOrder } from "@vaultchat/chat-react";
import type { WsServerEvent } from "@vaultchat/protocol";
import { fetchGroups } from "@vaultchat/client";
import { useCallback, useEffect, useState } from "react";
import { ServerRail } from "./ServerRail";
import { Sidebar } from "./Sidebar";
import { FriendsPanel } from "./FriendsPanel";
import { GroupsPanel } from "./GroupsPanel";
import { GroupServerView } from "./GroupServerView";
import { ChatPanel } from "./ChatPanel";
import { WelcomePanel } from "./WelcomePanel";

type Chat = ReturnType<typeof useVaultChat>;
type Friends = ReturnType<typeof useFriends>;
type Calls = ReturnType<typeof useCallSession>;
type RailNav = "home" | "friends";
type HubView = "friends" | "groups";

export function DiscordLayout({
  chat,
  friends,
  calls,
  onOpenSettings,
  groupServerEventRef,
}: {
  chat: Chat;
  friends: Friends;
  calls: Calls;
  onOpenSettings: () => void;
  groupServerEventRef: React.MutableRefObject<((e: WsServerEvent) => void) | undefined>;
}) {
  const [rail, setRail] = useState<RailNav>("home");
  const [hubView, setHubView] = useState<HubView>("friends");
  const [activeGroup, setActiveGroup] = useState<{ id: string; name: string } | null>(null);
  const [groups, setGroups] = useState<Awaited<ReturnType<typeof fetchGroups>>>([]);
  const session = chat.session!;

  const refreshGroups = useCallback(async () => {
    try {
      setGroups(await fetchGroups(session.token));
    } catch {
      // non-fatal
    }
  }, [session.token]);

  useEffect(() => {
    void refreshGroups();
  }, [refreshGroups]);

  const { sortedGroups, moveGroup, bumpGroup } = useGroupRailOrder(session.userId, groups);

  function goHome() {
    void chat.closeConversation();
    setActiveGroup(null);
    setRail("home");
  }

  function goFriends() {
    void chat.closeConversation();
    setActiveGroup(null);
    setRail("friends");
    setHubView("friends");
  }

  function openFriendChat(userId: string, username: string) {
    setActiveGroup(null);
    setRail("friends");
    void chat.openConversation(userId, username);
  }

  function openHub(view: HubView) {
    void chat.closeConversation();
    setActiveGroup(null);
    setHubView(view);
    if (rail !== "friends") setRail("friends");
  }

  function openGroup(groupId: string, name: string) {
    void chat.closeConversation();
    setRail("friends");
    setHubView("groups");
    setActiveGroup({ id: groupId, name });
    bumpGroup(groupId);
  }

  return (
    <div className="dc-app">
      <ServerRail
        rail={rail}
        activeGroupId={activeGroup?.id ?? null}
        groups={sortedGroups.map((g) => ({ id: g.id, name: g.name }))}
        onHome={goHome}
        onFriends={goFriends}
        onSelectGroup={openGroup}
        onReorderGroup={moveGroup}
        username={session.username}
        unread={chat.chatUnreadCount}
        friendsUnread={friends.unreadCount}
        ownPresence={friends.ownPresence}
        onPresenceChange={friends.setPresence}
        presenceDisabled={!chat.isConnected}
        onOpenSettings={onOpenSettings}
      />
      {!activeGroup && (
        <Sidebar
          rail={rail}
          hubView={hubView}
          chat={chat}
          friends={friends}
          onHubView={openHub}
          onGoHome={goHome}
        />
      )}
      {chat.peer ? (
        <ChatPanel chat={chat} calls={calls} friends={friends} />
      ) : activeGroup ? (
        <GroupServerView
          token={session.token}
          userId={session.userId}
          username={session.username}
          deviceId={session.deviceId}
          groupId={activeGroup.id}
          groupName={activeGroup.name}
          friends={friends}
          groupKeysVersion={chat.groupKeysVersion}
          onBack={() => setActiveGroup(null)}
          onServerEventRef={groupServerEventRef}
          onOpenDm={(peerId, peerUsername) => {
            void chat.openConversation(peerId, peerUsername);
          }}
        />
      ) : rail === "home" ? (
        <WelcomePanel username={session.username} />
      ) : hubView === "groups" ? (
        <GroupsPanel
          authToken={session.token}
          userId={session.userId}
          username={session.username}
          deviceId={session.deviceId}
          friends={friends.friends}
          onSelectGroup={openGroup}
          onGroupsChanged={refreshGroups}
        />
      ) : (
        <FriendsPanel
          authToken={session.token}
          friends={friends}
          onMessage={openFriendChat}
        />
      )}
    </div>
  );
}
