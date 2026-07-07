import type { useCallSession, useFriends, useVaultChat } from "@vaultchat/chat-react";
import { useState } from "react";
import { ServerRail } from "./ServerRail";
import { Sidebar } from "./Sidebar";
import { FriendsPanel } from "./FriendsPanel";
import { ChatPanel } from "./ChatPanel";
import { WelcomePanel } from "./WelcomePanel";

type Chat = ReturnType<typeof useVaultChat>;
type Friends = ReturnType<typeof useFriends>;
type Calls = ReturnType<typeof useCallSession>;
type Nav = "home" | "friends";

export function DiscordLayout({
  chat,
  friends,
  calls,
  onOpenSettings,
}: {
  chat: Chat;
  friends: Friends;
  calls: Calls;
  onOpenSettings: () => void;
}) {
  const [nav, setNav] = useState<Nav>("home");

  function openFriendChat(userId: string, username: string) {
    setNav("home");
    void chat.openConversation(userId, username);
  }

  return (
    <div className="dc-app">
      <ServerRail
        nav={nav}
        onNav={setNav}
        username={chat.session!.username}
        unread={chat.chatUnreadCount}
        friendsUnread={friends.unreadCount}
        onOpenSettings={onOpenSettings}
      />
      <Sidebar nav={nav} chat={chat} />
      {chat.peer ? (
        <ChatPanel chat={chat} calls={calls} />
      ) : nav === "friends" ? (
        <FriendsPanel
          authToken={chat.session!.token}
          friends={friends}
          onMessage={openFriendChat}
        />
      ) : (
        <WelcomePanel username={chat.session!.username} />
      )}
    </div>
  );
}
