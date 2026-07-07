import {
  acceptFriendRequest,
  fetchFriendRequests,
  fetchFriends,
  rejectFriendRequest,
  sendFriendRequest,
} from "@vaultchat/client";
import type { FriendInfo, FriendRequestInfo, WsServerEvent } from "@vaultchat/protocol";
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseFriendsOptions {
  token: string | null;
  onToast?: (message: string, type?: "info" | "error") => void;
}

export function useFriends({ token, onToast }: UseFriendsOptions) {
  const onToastRef = useRef(onToast);
  onToastRef.current = onToast;
  const toast = useCallback((message: string, type?: "info" | "error") => {
    onToastRef.current?.(message, type);
  }, []);
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setFriends([]);
      setIncoming([]);
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
    },
    [token, refresh, toast]
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

  const unreadCount = incoming.length;

  return {
    friends,
    incoming,
    loading,
    unreadCount,
    refresh,
    addFriend,
    accept,
    reject,
    handleServerEvent,
  };
}
