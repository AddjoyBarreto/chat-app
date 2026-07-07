import { useFriends } from "@vaultchat/chat-react";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Alert } from "react-native";
import { useApp } from "./AppContext";

type FriendsContextValue = ReturnType<typeof useFriends>;

const FriendsContext = createContext<FriendsContextValue | null>(null);

export function FriendsProvider({ children }: { children: ReactNode }) {
  const { session, onServerEventHandlers, connectionState, gatewaySend } = useApp();

  const friends = useFriends({
    token: session?.token ?? null,
    isConnected: connectionState === "connected",
    send: gatewaySend,
    onToast: (msg, type) => {
      if (type === "error") Alert.alert("Friends", msg);
    },
  });

  useEffect(() => {
    const handler = friends.handleServerEvent;
    onServerEventHandlers.current.add(handler);
    return () => {
      onServerEventHandlers.current.delete(handler);
    };
  }, [friends.handleServerEvent, onServerEventHandlers]);

  return <FriendsContext.Provider value={friends}>{children}</FriendsContext.Provider>;
}

export function useFriendsContext() {
  const ctx = useContext(FriendsContext);
  if (!ctx) throw new Error("useFriendsContext must be used within FriendsProvider");
  return ctx;
}
