"use client";

import type { ChannelCategoryInfo, ChannelInfo, ChannelType, GroupMemberInfo } from "@vaultchat/protocol";
import type { FriendPick } from "@vaultchat/client";
import {
  blockUser,
  demoteCommunityMember,
  fetchGroups,
  kickCommunityMember,
  presenceLabel,
  promoteCommunityMember,
  sendFriendRequest,
} from "@vaultchat/client";
import {
  ChannelTypeIcon,
  CreateChannelModal,
  ChannelSettingsModal,
  CommunityChannelSidebar,
  CommunitySettingsModal,
  IconInvite,
  IconKey,
  IconClose,
  IconPlus,
  IconSend,
  IconSettings,
  MarkdownComposerField,
  MarkdownText,
  MemberProfilePopout,
  PresenceDot,
  type CommunitySettingsTab,
} from "@vaultchat/chat-react";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Virtuoso } from "react-virtuoso";
import {
  decryptIncomingChannelMessage,
  decryptIncomingGroupMessage,
  getGroupAccess,
  loadCommunityChannelMessages,
  sendChannelTextMessage,
} from "@/lib/groups";
import { friendlyError } from "@/lib/errors";

interface CommunityMessage {
  id: string;
  from: "me" | "them";
  username: string;
  text: string;
  time: string;
  failed?: boolean;
}

export function CommunityView({
  communityId,
  communityName,
  communityDescription,
  categories,
  channels,
  token,
  userId,
  username,
  friends,
  getPresence,
  groupKeyVersion,
  onBack,
  onCommunityUpdated,
  onReshareKey,
  onShareKeyWithMember,
  resharing,
  onRefreshChannels,
  onServerEvent,
  onOpenDm,
}: {
  communityId: string;
  communityName: string;
  communityDescription?: string;
  categories: ChannelCategoryInfo[];
  channels: ChannelInfo[];
  token: string;
  userId: string;
  username: string;
  friends: FriendPick[];
  getPresence: (userId: string) => import("@vaultchat/protocol").PresenceStatus;
  groupKeyVersion?: number;
  onBack: () => void;
  onCommunityUpdated?: (patch: { name?: string; description?: string }) => void;
  onReshareKey: () => Promise<void>;
  onShareKeyWithMember: (targetUserId: string) => Promise<void>;
  resharing?: boolean;
  onRefreshChannels?: () => Promise<void>;
  onServerEvent?: (handler: (event: import("@vaultchat/protocol").WsServerEvent) => void) => () => void;
  onOpenDm?: (peerId: string, peerUsername: string, draft?: string) => void;
}) {
  const [displayName, setDisplayName] = useState(communityName);
  const [displayDescription, setDisplayDescription] = useState(communityDescription);
  const [localCategories, setLocalCategories] = useState(categories);
  const [localChannels, setLocalChannels] = useState(channels);
  const [activeChannel, setActiveChannel] = useState<ChannelInfo | null>(null);
  const [members, setMembers] = useState<GroupMemberInfo[]>([]);
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [messageCursor, setMessageCursor] = useState<string | undefined>();
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [legacyHistory, setLegacyHistory] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [hasGroupKey, setHasGroupKey] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [createdBy, setCreatedBy] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<CommunitySettingsTab>("overview");
  const [createChannel, setCreateChannel] = useState<{
    categoryId?: string;
    type: ChannelType;
  } | null>(null);
  const [channelSettings, setChannelSettings] = useState<ChannelInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileMember, setProfileMember] = useState<GroupMemberInfo | null>(null);
  const [profileAnchor, setProfileAnchor] = useState<{ top: number; left: number } | null>(null);
  const messageIdsRef = useRef(new Set<string>());
  const sendingInFlightRef = useRef(false);
  const activeChannelRef = useRef<ChannelInfo | null>(null);
  activeChannelRef.current = activeChannel;

  const friendIds = useMemo(() => new Set(friends.map((f) => f.userId)), [friends]);
  const isOwner = createdBy !== null && createdBy === userId;

  function openMemberProfile(m: GroupMemberInfo, e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setProfileAnchor({ top: rect.top, left: rect.left });
    setProfileMember(m);
  }

  useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);

  useEffect(() => {
    setLocalChannels(channels);
  }, [channels]);

  useEffect(() => {
    setDisplayName(communityName);
  }, [communityName]);

  useEffect(() => {
    setDisplayDescription(communityDescription);
  }, [communityDescription]);

  const refreshAccess = useCallback(async () => {
    const access = await getGroupAccess(token, communityId, userId);
    setHasGroupKey(access.hasKey);
    setIsAdmin(access.isAdmin);
    return access;
  }, [token, communityId, userId]);

  const loadMessages = useCallback(
    async (channelId: string, allowLegacyFallback = false) => {
      const page = await loadCommunityChannelMessages(token, communityId, channelId, userId, {
        allowLegacyFallback,
      });
      if (activeChannelRef.current?.id !== channelId) return;
      const memberMap = new Map(members.map((m) => [m.userId, m.username]));
      const next: CommunityMessage[] = page.messages.map((m) => ({
        id: m.id,
        from: m.from,
        username:
          m.from === "me" ? username : (m.senderId && memberMap.get(m.senderId)) || "Member",
        text: m.text,
        time: m.time,
        failed: m.failed,
      }));
      messageIdsRef.current = new Set(next.map((m) => m.id));
      setMessages(next);
      setMessageCursor(page.cursor);
      setHasMoreMessages(page.hasMore);
      setLegacyHistory(Boolean(page.legacy));
    },
    [token, communityId, userId, username, members]
  );

  const loadOlderMessages = useCallback(async () => {
    const channel = activeChannelRef.current;
    if (!channel || !messageCursor || loadingOlder || !hasMoreMessages) return;
    setLoadingOlder(true);
    try {
      const page = await loadCommunityChannelMessages(token, communityId, channel.id, userId, {
        cursor: messageCursor,
        legacy: legacyHistory,
      });
      const older: CommunityMessage[] = [];
      const memberMap = new Map(members.map((m) => [m.userId, m.username]));
      for (const m of page.messages) {
        if (messageIdsRef.current.has(m.id)) continue;
        messageIdsRef.current.add(m.id);
        older.push({
          id: m.id,
          from: m.from,
          username:
            m.from === "me" ? username : (m.senderId && memberMap.get(m.senderId)) || "Member",
          text: m.text,
          time: m.time,
          failed: m.failed,
        });
      }
      setMessages((prev) => [...older, ...prev]);
      setMessageCursor(page.cursor);
      setHasMoreMessages(page.hasMore);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoadingOlder(false);
    }
  }, [token, communityId, userId, username, members, messageCursor, loadingOlder, hasMoreMessages, legacyHistory]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const { fetchGroupMembers } = await import("@vaultchat/client");
        const [memberList, groupList, access] = await Promise.all([
          fetchGroupMembers(token, communityId),
          fetchGroups(token),
          getGroupAccess(token, communityId, userId),
        ]);
        if (cancelled) return;
        setMembers(memberList);
        setCreatedBy(groupList.find((g) => g.id === communityId)?.createdBy ?? null);
        setHasGroupKey(access.hasKey);
        setIsAdmin(access.isAdmin);
        const general =
          localChannels.find((c) => c.type === "text" && c.name === "general") ??
          localChannels.find((c) => c.type === "text") ??
          null;
        setActiveChannel(general);
      } catch (e) {
        if (!cancelled) setError(friendlyError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, communityId, userId, localChannels]);

  async function refreshChannelsList() {
    if (onRefreshChannels) {
      await onRefreshChannels();
      return;
    }
    const { fetchCommunityChannels } = await import("@vaultchat/client");
    const { channels: next } = await fetchCommunityChannels(token, communityId);
    setLocalChannels(next);
  }

  function handleChannelCreated(channel: ChannelInfo) {
    setLocalChannels((prev) => [...prev, channel]);
    setActiveChannel(channel);
    void refreshChannelsList();
  }

  function handleChannelDeleted(channelId: string) {
    setLocalChannels((prev) => {
      const remaining = prev.filter((c) => c.id !== channelId);
      setActiveChannel((active) => {
        if (active?.id !== channelId) return active;
        return (
          remaining.find((c) => c.type === "text" && c.name === "general") ??
          remaining.find((c) => c.type === "text") ??
          null
        );
      });
      return remaining;
    });
    setChannelSettings(null);
    void refreshChannelsList();
  }

  async function handleChannelDelete(channel: ChannelInfo) {
    if (
      !window.confirm(
        `Delete #${channel.name}? This cannot be undone.`
      )
    ) {
      return;
    }
    setError(null);
    try {
      const { deleteCommunityChannel } = await import("@vaultchat/client");
      await deleteCommunityChannel(token, channel.id);
      handleChannelDeleted(channel.id);
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  async function handleCreateCategory() {
    const name = window.prompt("Category name");
    if (!name?.trim()) return;
    setError(null);
    try {
      const { createChannelCategory, fetchChannelCategories } = await import("@vaultchat/client");
      await createChannelCategory(token, communityId, { name: name.trim() });
      const { categories: next } = await fetchChannelCategories(token, communityId);
      setLocalCategories(next);
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  function handleChannelUpdated(channel: ChannelInfo) {
    setLocalChannels((prev) => prev.map((c) => (c.id === channel.id ? channel : c)));
    setActiveChannel((prev) => (prev?.id === channel.id ? channel : prev));
    void refreshChannelsList();
  }

  useEffect(() => {
    if (groupKeyVersion === undefined || groupKeyVersion === 0) return;
    void refreshAccess().then((access) => {
      const channel = activeChannelRef.current;
      if (access.hasKey && channel?.type === "text") void loadMessages(channel.id);
    });
  }, [groupKeyVersion, refreshAccess, loadMessages]);

  useEffect(() => {
    if (!activeChannel || activeChannel.type !== "text" || !hasGroupKey) return;
    setMessages([]);
    setMessageCursor(undefined);
    setHasMoreMessages(false);
    setLegacyHistory(false);
    messageIdsRef.current = new Set();
    void loadMessages(activeChannel.id, activeChannel.name === "general").catch((e) =>
      setError(friendlyError(e))
    );
  }, [activeChannel, hasGroupKey, loadMessages]);

  useEffect(() => {
    if (!onServerEvent) return;
    return onServerEvent((event) => {
      if (event.type === "member_join" && event.communityId === communityId) {
        setMembers((prev) => {
          if (prev.some((m) => m.userId === event.userId)) return prev;
          return [...prev, { userId: event.userId, username: event.username, role: "member" }];
        });
        return;
      }
      if (event.type === "member_leave" && event.communityId === communityId) {
        setMembers((prev) => prev.filter((m) => m.userId !== event.userId));
        return;
      }
      if (
        event.type === "channel_message" &&
        activeChannelRef.current?.id === event.envelope.channelId
      ) {
        void decryptIncomingChannelMessage(communityId, event.envelope, userId).then((msg) => {
          const author =
            members.find((m) => m.userId === event.envelope.senderId)?.username ?? "Member";
          setMessages((prev) => {
            if (messageIdsRef.current.has(msg.id) || prev.some((m) => m.id === msg.id)) return prev;
            messageIdsRef.current.add(msg.id);
            return [
              ...prev,
              {
                id: msg.id,
                from: msg.from,
                username: msg.from === "me" ? username : author,
                text: msg.text,
                time: msg.time,
                failed: msg.failed,
              },
            ];
          });
        });
        return;
      }
      // Legacy community-wide group messages (pre-channel storage)
      if (
        event.type === "group_message" &&
        event.envelope.groupId === communityId &&
        activeChannelRef.current?.name === "general"
      ) {
        void decryptIncomingGroupMessage(communityId, event.envelope, userId).then((msg) => {
          const author =
            members.find((m) => m.userId === event.envelope.senderId)?.username ?? "Member";
          setMessages((prev) => {
            if (messageIdsRef.current.has(msg.id) || prev.some((m) => m.id === msg.id)) return prev;
            messageIdsRef.current.add(msg.id);
            return [
              ...prev,
              {
                id: msg.id,
                from: msg.from,
                username: msg.from === "me" ? username : author,
                text: msg.text,
                time: msg.time,
                failed: msg.failed,
              },
            ];
          });
        });
      }
    });
  }, [onServerEvent, communityId, userId, username, members]);

  const activeMembers = useMemo(
    () => members.filter((m) => getPresence(m.userId) !== "offline"),
    [members, getPresence]
  );
  const offlineMembers = useMemo(
    () => members.filter((m) => getPresence(m.userId) === "offline"),
    [members, getPresence]
  );

  async function handleSend() {
    if (
      sendingInFlightRef.current ||
      sending ||
      !draft.trim() ||
      !hasGroupKey ||
      activeChannel?.type !== "text"
    ) {
      return;
    }
    const text = draft.trim();
    const channelId = activeChannel.id;
    sendingInFlightRef.current = true;
    setSending(true);
    setDraft("");
    const optimisticId = crypto.randomUUID();
    const optimistic: CommunityMessage = {
      id: optimisticId,
      from: "me",
      username,
      text,
      time: new Date().toISOString(),
    };
    messageIdsRef.current.add(optimisticId);
    setMessages((prev) => [...prev, optimistic]);
    try {
      const result = await sendChannelTextMessage(token, userId, communityId, channelId, text);
      // Register server id before reconcile so a late WS echo can't append a second copy.
      messageIdsRef.current.add(result.messageId);
      messageIdsRef.current.delete(optimisticId);
      setMessages((prev) => {
        if (prev.some((m) => m.id === result.messageId)) {
          return prev.filter((m) => m.id !== optimisticId);
        }
        return prev.map((m) =>
          m.id === optimisticId ? { ...m, id: result.messageId, time: result.createdAt } : m
        );
      });
    } catch (e) {
      messageIdsRef.current.delete(optimisticId);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setDraft(text);
      setError(friendlyError(e));
    } finally {
      sendingInFlightRef.current = false;
      setSending(false);
    }
  }

  async function handleReshare() {
    setError(null);
    try {
      await onReshareKey();
      await refreshAccess();
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  if (loading) {
    return (
      <div className="vc-community-layout">
        <div className="vc-community-loading">
          <div className="vc-spinner" />
          <p>Loading community…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="vc-community-layout">
      <CommunityChannelSidebar
        communityName={displayName}
        categories={localCategories}
        channels={localChannels}
        activeChannelId={activeChannel?.id}
        isAdmin={isAdmin}
        onOpenServerSettings={(tab) => {
          setSettingsTab(tab ?? "overview");
          setSettingsOpen(true);
        }}
        onCreateCategory={isAdmin ? () => void handleCreateCategory() : undefined}
        onCreateChannel={
          isAdmin
            ? (categoryId, type) =>
                setCreateChannel({ categoryId: categoryId || undefined, type })
            : undefined
        }
        onChannelSettings={isAdmin ? (ch) => setChannelSettings(ch) : undefined}
        onChannelDelete={isAdmin ? (ch) => void handleChannelDelete(ch) : undefined}
        onSelectChannel={(ch) => {
          setActiveChannel(ch);
          setError(null);
        }}
        onBack={onBack}
      />

      <main className="vc-community-main">
        {error && (
          <div className="vc-banner vc-banner--warning" role="alert">
            {error}
            <button type="button" className="vc-banner__dismiss" onClick={() => setError(null)}>
              <IconClose size={14} />
            </button>
          </div>
        )}

        {!activeChannel && (
          <div className="vc-community-welcome">
            <h2>Welcome to {displayName}</h2>
            <p>Select a channel from the sidebar to get started.</p>
          </div>
        )}

        {activeChannel?.type === "voice" && (
          <div className="vc-community-voice">
            <header className="vc-community-channel-header">
              <span className="vc-community-channel-header__icon">
                <ChannelTypeIcon type="voice" size={22} />
              </span>
              <h1>{activeChannel.name}</h1>
            </header>
            <div className="vc-community-voice__body">
              <h2>Voice channel</h2>
              <p>Voice channels are available on desktop and mobile for now.</p>
            </div>
          </div>
        )}

        {activeChannel?.type === "text" && (
          <>
            <header className="vc-community-channel-header">
              <span className="vc-community-channel-header__icon">
                <ChannelTypeIcon type="text" size={22} />
              </span>
              <h1>{activeChannel.name}</h1>
              <span className="vc-community-channel-header__meta">End-to-end encrypted</span>
              {isAdmin && hasGroupKey && (
                <button
                  type="button"
                  className="vc-community-channel-header__action"
                  onClick={() => void handleReshare()}
                  disabled={resharing}
                  title="Re-share encryption key with all members"
                >
                  {resharing ? "…" : <IconKey size={18} />}
                </button>
              )}
            </header>

            {!hasGroupKey && (
              <div className="vc-banner vc-banner--warning">
                <div>
                  <strong>Missing encryption key</strong>
                  <p>
                    {isAdmin
                      ? "This device doesn't have the community key yet. Open Server Settings to re-share keys, or check your encrypted DMs."
                      : "Ask a community admin to re-share the encryption key. You may receive it in your DMs."}
                  </p>
                </div>
                {isAdmin && hasGroupKey && (
                  <button
                    type="button"
                    className="vc-btn vc-btn--secondary vc-banner__action"
                    onClick={() => void handleReshare()}
                    disabled={resharing}
                  >
                    {resharing ? "Sharing…" : "Re-share key"}
                  </button>
                )}
              </div>
            )}

            <div className="vc-community-messages">
              {messages.length === 0 ? (
                <div className="vc-community-welcome vc-community-welcome--inline">
                  <h2>Welcome to #{activeChannel.name}</h2>
                  <p>This is the start of the channel. Messages are encrypted for all members.</p>
                </div>
              ) : (
                <Virtuoso
                  className="vc-community-virtuoso"
                  style={{ height: "100%" }}
                  data={messages}
                  initialTopMostItemIndex={messages.length - 1}
                  followOutput="smooth"
                  atTopStateChange={(atTop) => {
                    if (atTop && hasMoreMessages && !loadingOlder) void loadOlderMessages();
                  }}
                  components={{
                    Header: () =>
                      loadingOlder ? (
                        <div className="vc-community-messages__older">Loading older messages…</div>
                      ) : null,
                  }}
                  itemContent={(_i, m) => (
                    <div
                      className={`vc-community-msg${m.from === "me" ? " vc-community-msg--me" : ""}${m.failed ? " vc-community-msg--failed" : ""}`}
                    >
                      <div className="vc-community-msg__avatar">{m.username[0]?.toUpperCase()}</div>
                      <div className="vc-community-msg__body">
                        <div className="vc-community-msg__meta">
                          <strong>{m.username}</strong>
                          <time>
                            {new Date(m.time).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        </div>
                        <MarkdownText text={m.text} className="vc-bubble__text" />
                      </div>
                    </div>
                  )}
                />
              )}
            </div>

            <form
              className="vc-community-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
            >
              <MarkdownComposerField
                value={draft}
                onChange={setDraft}
                inputClassName="vc-community-composer__input"
                placeholder={
                  hasGroupKey ? `Message #${activeChannel.name}` : "Waiting for encryption key…"
                }
                disabled={sending || !hasGroupKey}
                rows={1}
              />
              <button
                type="submit"
                className="vc-community-composer__send"
                disabled={!draft.trim() || sending || !hasGroupKey}
                aria-label="Send"
              >
                {sending ? <span className="vc-spinner" /> : <IconSend size={18} />}
              </button>
            </form>
          </>
        )}
      </main>

      <aside className="vc-community-members" aria-label="Members">
        <div className="vc-community-members__header">
          <h3 className="vc-community-members__title">Members — {members.length}</h3>
          {isAdmin && (
            <div className="vc-community-members__actions">
              <button
                type="button"
                className="vc-community-members__action"
                title="Add members"
                aria-label="Add members"
                onClick={() => {
                  setSettingsTab("members");
                  setSettingsOpen(true);
                }}
              >
                <IconPlus size={16} />
              </button>
              <button
                type="button"
                className="vc-community-members__action"
                title="Invite link"
                aria-label="Create invite link"
                onClick={() => {
                  setSettingsTab("invites");
                  setSettingsOpen(true);
                }}
              >
                <IconInvite size={16} />
              </button>
              <button
                type="button"
                className="vc-community-members__action"
                title="Server settings"
                aria-label="Server settings"
                onClick={() => {
                  setSettingsTab("overview");
                  setSettingsOpen(true);
                }}
              >
                <IconSettings size={16} />
              </button>
            </div>
          )}
        </div>
        {activeMembers.length > 0 && (
          <section>
            <h4>Online — {activeMembers.length}</h4>
            <ul>
              {activeMembers.map((m) => {
                const status = getPresence(m.userId);
                return (
                  <li key={m.userId}>
                    <button
                      type="button"
                      className={`vc-community-members__row${profileMember?.userId === m.userId ? " vc-community-members__row--active" : ""}`}
                      onClick={(e) => openMemberProfile(m, e)}
                    >
                      <span className="vc-community-members__avatar">{m.username[0]}</span>
                      <span className="vc-community-members__name">{m.username}</span>
                      {m.role === "admin" && <span className="vc-community-members__badge">Admin</span>}
                      <PresenceDot status={status} />
                      <span className="vc-community-members__status">{presenceLabel(status)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <section>
          <h4>Offline — {offlineMembers.length}</h4>
          <ul>
            {offlineMembers.map((m) => {
              const status = getPresence(m.userId);
              return (
                <li key={m.userId} className="vc-community-members__offline">
                  <button
                    type="button"
                    className={`vc-community-members__row${profileMember?.userId === m.userId ? " vc-community-members__row--active" : ""}`}
                    onClick={(e) => openMemberProfile(m, e)}
                  >
                    <span className="vc-community-members__avatar">{m.username[0]}</span>
                    <span className="vc-community-members__name">{m.username}</span>
                    {m.role === "admin" && <span className="vc-community-members__badge">Admin</span>}
                    <PresenceDot status={status} />
                    <span className="vc-community-members__status">{presenceLabel(status)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </aside>

      {profileMember && (
        <MemberProfilePopout
          member={profileMember}
          status={getPresence(profileMember.userId)}
          isSelf={profileMember.userId === userId}
          isViewerAdmin={isAdmin}
          isFriend={friendIds.has(profileMember.userId)}
          anchor={profileAnchor}
          onClose={() => {
            setProfileMember(null);
            setProfileAnchor(null);
          }}
          onMessage={(peerId, peerUsername, draft) => {
            onOpenDm?.(peerId, peerUsername, draft);
          }}
          onAddFriend={
            friendIds.has(profileMember.userId)
              ? undefined
              : async () => {
                  await sendFriendRequest(token, profileMember.username);
                }
          }
          onBlock={async () => {
            if (!window.confirm(`Block @${profileMember.username}?`)) return;
            await blockUser(token, profileMember.username);
            setProfileMember(null);
          }}
          onKick={
            isAdmin && profileMember.role !== "admin"
              ? async () => {
                  if (!window.confirm(`Remove ${profileMember.username} from this server?`)) return;
                  await kickCommunityMember(token, communityId, profileMember.userId);
                  setMembers((prev) => prev.filter((x) => x.userId !== profileMember.userId));
                  setProfileMember(null);
                }
              : undefined
          }
          onPromote={
            isAdmin && profileMember.role !== "admin"
              ? async () => {
                  await promoteCommunityMember(token, communityId, profileMember.userId);
                  setMembers((prev) =>
                    prev.map((x) =>
                      x.userId === profileMember.userId ? { ...x, role: "admin" as const } : x
                    )
                  );
                }
              : undefined
          }
          onDemote={
            isOwner &&
            profileMember.role === "admin" &&
            profileMember.userId !== createdBy
              ? async () => {
                  await demoteCommunityMember(token, communityId, profileMember.userId);
                  setMembers((prev) =>
                    prev.map((x) =>
                      x.userId === profileMember.userId ? { ...x, role: "member" as const } : x
                    )
                  );
                  setProfileMember((prev) =>
                    prev ? { ...prev, role: "member" as const } : prev
                  );
                }
              : undefined
          }
          onShareKey={
            isAdmin
              ? async () => {
                  await onShareKeyWithMember(profileMember.userId);
                }
              : undefined
          }
        />
      )}

      {settingsOpen && (
        <CommunitySettingsModal
          communityId={communityId}
          communityName={displayName}
          communityDescription={displayDescription}
          token={token}
          userId={userId}
          isAdmin={isAdmin}
          isOwner={isOwner}
          friends={friends}
          resharing={resharing}
          initialTab={settingsTab}
          onClose={() => setSettingsOpen(false)}
          onMembersChanged={async () => {
            try {
              const { fetchGroupMembers } = await import("@vaultchat/client");
              setMembers(await fetchGroupMembers(token, communityId));
            } catch {
              // non-fatal
            }
          }}
          onUpdated={(patch) => {
            if (patch.name) setDisplayName(patch.name);
            if (patch.description !== undefined) setDisplayDescription(patch.description);
            onCommunityUpdated?.(patch);
          }}
          onReshareKey={handleReshare}
          onShareKeyWithMember={onShareKeyWithMember}
        />
      )}

      {createChannel && isAdmin && (
        <CreateChannelModal
          token={token}
          communityId={communityId}
          categoryId={createChannel.categoryId}
          channelType={createChannel.type}
          onClose={() => setCreateChannel(null)}
          onCreated={handleChannelCreated}
        />
      )}

      {channelSettings && isAdmin && (
        <ChannelSettingsModal
          channel={channelSettings}
          token={token}
          communityMembers={members}
          onClose={() => setChannelSettings(null)}
          onUpdated={handleChannelUpdated}
          onDeleted={handleChannelDeleted}
        />
      )}
    </div>
  );
}
