import {
  acceptFriendRequest,
  fetchFriendRequests,
  fetchFriends,
  rejectFriendRequest,
  sendFriendRequest,
} from "@vaultchat/client";
import type {
  FriendInfo,
  FriendRequestInfo,
  PresenceStatus,
  SettablePresenceStatus,
  WsClientEvent,
  WsServerEvent,
} from "@vaultchat/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePresenceActivity } from "./usePresenceActivity.js";

export interface UseFriendsOptions {
  token: string | null;
  isConnected?: boolean;
  send?: (event: WsClientEvent) => boolean;
  onToast?: (message: string, type?: "info" | "error") => void;
}

export function useFriends({ token, isConnected, send, onToast }: UseFriendsOptions) {
  const onToastRef = useRef(onToast);
  onToastRef.current = onToast;
  const toast = useCallback((message: string, type?: "info" | "error") => {
    onToastRef.current?.(message, type);
  }, []);

  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [presenceByUserId, setPresenceByUserId] = useState<Map<string, PresenceStatus>>(
    () => new Map()
  );
  const [ownPresence, setOwnPresence] = useState<SettablePresenceStatus>("online");
  const manualModeRef = useRef<SettablePresenceStatus | "auto">("auto");

  const refresh = useCallback(async () => {
    if (!token) {
      setFriends([]);
      setIncoming([]);
      setPresenceByUserId(new Map());
      return;
    }
    setLoading(true);
    try {
      const [friendsRes, requestsRes] = await Promise.all([
        fetchFriends(token),
        fetchFriendRequests(token),
      ]);
      setFriends(friendsRes.friends);
      setIncoming(requestsRes.incoming);
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const wasConnectedRef = useRef(false);
  useEffect(() => {
    const connected = !!isConnected;
    if (connected && !wasConnectedRef.current && token) {
      void refresh();
    }
    wasConnectedRef.current = connected;
  }, [isConnected, token, refresh]);

  const applyPresenceUpdate = useCallback((userId: string, status: PresenceStatus) => {
    setPresenceByUserId((prev) => {
      const next = new Map(prev);
      if (status === "offline") next.delete(userId);
      else next.set(userId, status);
      return next;
    });
  }, []);

  const setPresence = useCallback(
    (status: SettablePresenceStatus, options?: { auto?: boolean }) => {
      if (!options?.auto) {
        manualModeRef.current = status === "online" ? "auto" : status;
      }
      setOwnPresence(status);
      const sent = send?.({ type: "presence_set", status });
      if (!sent && !options?.auto) {
        toast("Not connected — status will update when you're back online", "error");
      }
    },
    [send, toast]
  );

  const ownPresenceRef = useRef(ownPresence);
  ownPresenceRef.current = ownPresence;

  useEffect(() => {
    if (!isConnected || !send) return;
    send({ type: "presence_set", status: ownPresenceRef.current });
  }, [isConnected, send]);

  usePresenceActivity({
    enabled: !!isConnected && !!send,
    manualModeRef,
    ownPresence,
    onSetPresence: (status) => setPresence(status, { auto: true }),
  });

  const handleServerEvent = useCallback(
    (event: WsServerEvent) => {
      if (!token) return;
      if (event.type === "friend_request") {
        setIncoming((prev) => {
          if (prev.some((r) => r.id === event.request.id)) return prev;
          return [...prev, event.request];
        });
        toast(`Friend request from @${event.request.senderUsername}`, "info");
      }
      if (event.type === "friend_accept") {
        void refresh();
        toast(`@${event.friend.username} accepted your friend request`, "info");
      }
      if (event.type === "friends_changed") {
        void refresh();
      }
      if (event.type === "presence_snapshot") {
        setPresenceByUserId(new Map(event.friends.map((f) => [f.userId, f.status])));
      }
      if (event.type === "presence_update") {
        applyPresenceUpdate(event.userId, event.status);
      }
    },
    [token, refresh, toast, applyPresenceUpdate]
  );

  const addFriend = useCallback(
    async (username: string) => {
      if (!token) return;
      await sendFriendRequest(token, username);
      toast(`Friend request sent to @${username}`, "info");
    },
    [token, toast]
  );

  const accept = useCallback(
    async (requestId: string) => {
      if (!token) return;
      await acceptFriendRequest(token, requestId);
      await refresh();
    },
    [token, refresh]
  );

  const reject = useCallback(
    async (requestId: string) => {
      if (!token) return;
      await rejectFriendRequest(token, requestId);
      setIncoming((prev) => prev.filter((r) => r.id !== requestId));
    },
    [token]
  );

  const getPresence = useCallback(
    (userId: string): PresenceStatus => presenceByUserId.get(userId) ?? "offline",
    [presenceByUserId]
  );

  const isOnline = useCallback(
    (userId: string) => getPresence(userId) !== "offline",
    [getPresence]
  );

  const unreadCount = incoming.length;

  return {
    friends,
    incoming,
    loading,
    unreadCount,
    presenceByUserId,
    ownPresence,
    getPresence,
    isOnline,
    setPresence,
    refresh,
    addFriend,
    accept,
    reject,
    handleServerEvent,
  };
}
