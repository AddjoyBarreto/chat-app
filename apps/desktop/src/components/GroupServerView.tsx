import type { useFriends } from "@vaultchat/chat-react";
import type { CommunitySettingsTab } from "@vaultchat/chat-react";
import { ChannelSettingsModal, CommunityChannelSidebar, CommunitySettingsModal, CreateChannelModal, ChannelTypeIcon, IconInvite, IconPlus, IconSend, IconSettings, MarkdownText, MarkdownComposerField, MemberProfilePopout, PresenceDot } from "@vaultchat/chat-react";
import {
  blockUser,
  createChannelCategory,
  createLocalStorageAdapter,
  decryptChannelEnvelope,
  decryptGroupEnvelope,
  deleteCommunityChannel,
  demoteCommunityMember,
  fetchChannelCategories,
  fetchCommunityChannels,
  fetchGroupMembers,
  fetchGroups,
  fetchVoicePresence,
  friendlyError,
  joinVoiceChannel,
  kickCommunityMember,
  leaveVoiceChannel,
  loadChannelHistory,
  loadGroupCipher,
  presenceLabel,
  promoteCommunityMember,
  reshareGroupKey,
  resetGroupEncryptionKey,
  sendChannelContentMessage,
  sendFriendRequest,
  shareGroupKeyWithMember,
  MESSAGE_MARKDOWN_HINT,
} from "@vaultchat/client";
import type {
  ChannelCategoryInfo,
  ChannelInfo,
  ChannelType,
  GroupMemberInfo,
  VoicePresenceInfo,
  WsServerEvent,
} from "@vaultchat/protocol";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { loadUserDevice } from "./groupHelpers";

type Friends = ReturnType<typeof useFriends>;

interface GroupMessage {
  id: string;
  from: "me" | "them";
  username: string;
  text: string;
  time: string;
  failed?: boolean;
}

export function GroupServerView({
  token,
  userId,
  username,
  deviceId,
  groupId,
  groupName,
  friends,
  onBack,
  onServerEventRef,
  onOpenDm,
  groupKeysVersion = 0,
}: {
  token: string;
  userId: string;
  username: string;
  deviceId: number;
  groupId: string;
  groupName: string;
  friends: Friends;
  onBack: () => void;
  onServerEventRef?: React.MutableRefObject<((e: WsServerEvent) => void) | undefined>;
  onOpenDm?: (peerId: string, peerUsername: string, draft?: string) => void;
  groupKeysVersion?: number;
}) {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const [categories, setCategories] = useState<ChannelCategoryInfo[]>([]);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [activeChannel, setActiveChannel] = useState<ChannelInfo | null>(null);
  const [members, setMembers] = useState<GroupMemberInfo[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [messageCursor, setMessageCursor] = useState<string | undefined>();
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [legacyHistory, setLegacyHistory] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceMembers, setVoiceMembers] = useState<VoicePresenceInfo[]>([]);
  const [inVoice, setInVoice] = useState(false);
  const [hasGroupKey, setHasGroupKey] = useState(false);
  const [createChannel, setCreateChannel] = useState<{
    categoryId?: string;
    type: ChannelType;
  } | null>(null);
  const [channelSettings, setChannelSettings] = useState<ChannelInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<CommunitySettingsTab>("overview");
  const [displayName, setDisplayName] = useState(groupName);
  const [resharing, setResharing] = useState(false);
  const [profileMember, setProfileMember] = useState<GroupMemberInfo | null>(null);
  const [profileAnchor, setProfileAnchor] = useState<{ top: number; left: number } | null>(null);
  const [createdBy, setCreatedBy] = useState<string | null>(null);
  const messageIdsRef = useRef(new Set<string>());
  const activeChannelRef = useRef<ChannelInfo | null>(null);
  const sendingInFlightRef = useRef(false);
  activeChannelRef.current = activeChannel;

  const me = members.find((m) => m.userId === userId);
  const isAdmin = me?.role === "admin";
  const isOwner = createdBy !== null && createdBy === userId;
  const friendIds = useMemo(() => new Set(friends.friends.map((f) => f.userId)), [friends.friends]);

  function openMemberProfile(m: GroupMemberInfo, e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setProfileAnchor({ top: rect.top, left: rect.left });
    setProfileMember(m);
  }

  const refreshMembers = useCallback(async () => {
    const memberList = await fetchGroupMembers(token, groupId);
    setMembers(memberList);
    return memberList;
  }, [token, groupId]);

  async function handleReshareKey() {
    setResharing(true);
    setError(null);
    try {
      const device = await loadUserDevice(token, userId, username, deviceId);
      await reshareGroupKey(storage, token, device, userId, groupId);
      const cipher = await loadGroupCipher(storage, userId, groupId);
      setHasGroupKey(Boolean(cipher));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setResharing(false);
    }
  }

  async function handleResetEncryptionKey() {
    setResharing(true);
    setError(null);
    try {
      const device = await loadUserDevice(token, userId, username, deviceId);
      await resetGroupEncryptionKey(storage, token, device, userId, groupId);
      setHasGroupKey(true);
      setError(null);
      const channel = activeChannelRef.current;
      if (channel?.type === "text") {
        await loadMessages(channel.id);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setResharing(false);
    }
  }

  async function handleShareKeyWithMember(targetUserId: string) {
    const device = await loadUserDevice(token, userId, username, deviceId);
    await shareGroupKeyWithMember(storage, token, device, userId, groupId, targetUserId);
  }

  const refreshChannels = useCallback(async () => {
    const [ch, cats] = await Promise.all([
      fetchCommunityChannels(token, groupId),
      fetchChannelCategories(token, groupId),
    ]);
    setChannels(ch.channels);
    setCategories(cats.categories);
    return ch.channels;
  }, [token, groupId]);

  const loadMessages = useCallback(
    async (channelId: string, allowLegacyFallback = false) => {
      let device: Awaited<ReturnType<typeof loadUserDevice>> | undefined;
      try {
        device = await loadUserDevice(token, userId, username, deviceId);
      } catch {
        // recovery optional
      }
      const page = await loadChannelHistory(storage, token, groupId, channelId, userId, {
        device,
        allowLegacyFallback,
      });
      // Ignore stale responses after the user switched channels.
      if (activeChannelRef.current?.id !== channelId) return;
      const memberMap = new Map(members.map((m) => [m.userId, m.username]));
      const parsed: GroupMessage[] = page.messages.map((msg) => ({
        id: msg.id,
        from: msg.from,
        username:
          msg.from === "me"
            ? username
            : (msg.senderId && memberMap.get(msg.senderId)) || msg.senderId?.slice(0, 8) || "Member",
        text: msg.text,
        time: msg.time,
        failed: msg.failed,
      }));
      messageIdsRef.current = new Set(parsed.map((m) => m.id));
      setMessages(parsed);
      setMessageCursor(page.cursor);
      setHasMoreMessages(page.hasMore);
      setLegacyHistory(Boolean(page.legacy));
      if (parsed.length > 0 && parsed.every((m) => m.failed)) {
        const cipher = await loadGroupCipher(storage, userId, groupId);
        setError(
          cipher
            ? "Channel history was encrypted with a previous key and can't be unlocked. New messages will work."
            : "Couldn't decrypt channel history. Your community encryption key may be out of date — open Server Settings → Encryption to generate a new key, or ask an admin to re-share."
        );
      } else {
        setError(null);
      }
    },
    [token, groupId, storage, userId, username, deviceId, members]
  );

  const loadOlderMessages = useCallback(async () => {
    const channel = activeChannelRef.current;
    if (!channel || !messageCursor || loadingOlder || !hasMoreMessages) return;
    setLoadingOlder(true);
    try {
      const page = await loadChannelHistory(storage, token, groupId, channel.id, userId, {
        cursor: messageCursor,
        legacy: legacyHistory,
      });
      const memberMap = new Map(members.map((m) => [m.userId, m.username]));
      const older: GroupMessage[] = [];
      for (const msg of page.messages) {
        if (messageIdsRef.current.has(msg.id)) continue;
        messageIdsRef.current.add(msg.id);
        older.push({
          id: msg.id,
          from: msg.from,
          username:
            msg.from === "me"
              ? username
              : (msg.senderId && memberMap.get(msg.senderId)) ||
                msg.senderId?.slice(0, 8) ||
                "Member",
          text: msg.text,
          time: msg.time,
          failed: msg.failed,
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
  }, [
    storage,
    token,
    groupId,
    userId,
    username,
    members,
    messageCursor,
    loadingOlder,
    hasMoreMessages,
    legacyHistory,
  ]);

  const refreshVoice = useCallback(
    async (channelId: string) => {
      const res = await fetchVoicePresence(token, channelId);
      setVoiceMembers(res.members);
    },
    [token]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [memberList, ch, groupList] = await Promise.all([
          fetchGroupMembers(token, groupId),
          refreshChannels(),
          fetchGroups(token),
        ]);
        if (cancelled) return;
        setMembers(memberList);
        setCreatedBy(groupList.find((g) => g.id === groupId)?.createdBy ?? null);
        const cipher = await loadGroupCipher(storage, userId, groupId);
        setHasGroupKey(Boolean(cipher));
        const general =
          ch.find((c) => c.type === "text" && c.name === "general") ??
          ch.find((c) => c.type === "text") ??
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
  }, [token, groupId, userId, storage, refreshChannels]);

  useEffect(() => {
    if (!groupKeysVersion) return;
    void loadGroupCipher(storage, userId, groupId).then((cipher) => {
      setHasGroupKey(Boolean(cipher));
    });
  }, [groupKeysVersion, storage, userId, groupId]);

  useEffect(() => {
    if (!activeChannel || activeChannel.type !== "text") return;
    setMessages([]);
    setMessageCursor(undefined);
    setHasMoreMessages(false);
    setLegacyHistory(false);
    messageIdsRef.current = new Set();
    void loadMessages(activeChannel.id, activeChannel.name === "general").catch((e) =>
      setError(friendlyError(e))
    );
  }, [activeChannel, loadMessages, groupKeysVersion]);

  useEffect(() => {
    if (!activeChannel || activeChannel.type !== "voice") return;
    void refreshVoice(activeChannel.id).catch(() => {});
  }, [activeChannel, refreshVoice]);

  useEffect(() => {
    if (!onServerEventRef) return;
    const handler = (event: WsServerEvent) => {
      if (
        event.type === "channel_message" &&
        activeChannelRef.current?.id === event.envelope.channelId
      ) {
        void (async () => {
          const msg = await decryptChannelEnvelope(storage, groupId, event.envelope, userId);
          if (messageIdsRef.current.has(msg.id)) return;
          const author =
            members.find((m) => m.userId === event.envelope.senderId)?.username ??
            event.envelope.senderId.slice(0, 8);
          setMessages((prev) => {
            if (messageIdsRef.current.has(msg.id) || prev.some((m) => m.id === msg.id)) {
              return prev;
            }
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
        })();
      }
      if (
        event.type === "group_message" &&
        event.envelope.groupId === groupId &&
        activeChannelRef.current?.name === "general"
      ) {
        void (async () => {
          const msg = await decryptGroupEnvelope(storage, groupId, event.envelope, userId);
          if (messageIdsRef.current.has(msg.id)) return;
          const author =
            members.find((m) => m.userId === event.envelope.senderId)?.username ??
            event.envelope.senderId.slice(0, 8);
          setMessages((prev) => {
            if (messageIdsRef.current.has(msg.id) || prev.some((m) => m.id === msg.id)) {
              return prev;
            }
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
        })();
      }
      if (
        event.type === "voice_presence" &&
        activeChannel?.type === "voice" &&
        event.channelId === activeChannel.id
      ) {
        setVoiceMembers(event.members);
      }
    };
    onServerEventRef.current = handler;
    return () => {
      if (onServerEventRef.current === handler) onServerEventRef.current = undefined;
    };
  }, [onServerEventRef, groupId, storage, userId, username, members, activeChannel]);

  async function handleSend() {
    if (
      sendingInFlightRef.current ||
      sending ||
      !draft.trim() ||
      !hasGroupKey ||
      !activeChannel ||
      activeChannel.type !== "text"
    ) {
      return;
    }
    const text = draft.trim();
    const channelId = activeChannel.id;
    sendingInFlightRef.current = true;
    setSending(true);
    setDraft("");
    const optimisticId = crypto.randomUUID();
    messageIdsRef.current.add(optimisticId);
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, from: "me", username, text, time: new Date().toISOString() },
    ]);
    try {
      const result = await sendChannelContentMessage(
        storage,
        userId,
        token,
        groupId,
        channelId,
        { type: "text", text },
        "text"
      );
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

  async function handleChannelCreated(channel: ChannelInfo) {
    await refreshChannels();
    setActiveChannel(channel);
  }

  async function handleChannelUpdated(channel: ChannelInfo) {
    await refreshChannels();
    setActiveChannel((prev) => (prev?.id === channel.id ? channel : prev));
  }

  async function handleChannelDeleted(channelId: string) {
    const next = await refreshChannels();
    setActiveChannel((prev) => {
      if (prev?.id !== channelId) return prev;
      return (
        next.find((c) => c.type === "text" && c.name === "general") ??
        next.find((c) => c.type === "text") ??
        null
      );
    });
    setChannelSettings(null);
  }

  async function handleChannelDelete(channel: ChannelInfo) {
    if (!window.confirm(`Delete #${channel.name}? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteCommunityChannel(token, channel.id);
      await handleChannelDeleted(channel.id);
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  async function handleCreateCategory() {
    const name = window.prompt("Category name");
    if (!name?.trim()) return;
    setError(null);
    try {
      await createChannelCategory(token, groupId, { name: name.trim() });
      await refreshChannels();
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  async function toggleVoice() {
    if (!activeChannel || activeChannel.type !== "voice") return;
    try {
      if (inVoice) {
        await leaveVoiceChannel(token, activeChannel.id);
        setInVoice(false);
      } else {
        await joinVoiceChannel(token, activeChannel.id);
        setInVoice(true);
      }
      await refreshVoice(activeChannel.id);
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  const activeMembers = members.filter((m) => friends.getPresence(m.userId) !== "offline");
  const offlineMembers = members.filter((m) => friends.getPresence(m.userId) === "offline");

  if (loading) {
    return (
      <div className="dc-gc">
        <div className="dc-gc__loading">Loading group…</div>
      </div>
    );
  }

  return (
    <div className="dc-gc">
      <CommunityChannelSidebar
        communityName={displayName}
        categories={categories}
        channels={channels}
        activeChannelId={activeChannel?.id}
        isAdmin={isAdmin}
        onBack={onBack}
        backLabel="Groups"
        onOpenServerSettings={
          isAdmin
            ? (tab) => {
                setSettingsTab(tab ?? "overview");
                setSettingsOpen(true);
              }
            : undefined
        }
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
          if (ch.type === "voice") setInVoice(false);
        }}
      />

      <main className="dc-gc-main">
        {error && (
          <p className="dc-gc-error" role="alert">
            {error}
          </p>
        )}

        {activeChannel?.type === "text" && (
          <>
            <header className="dc-gc-header">
              <span className="dc-gc-header__hash">
                <ChannelTypeIcon type="text" size={22} />
              </span>
              <h1 className="dc-gc-header__title">{activeChannel.name}</h1>
              {isAdmin && (
                <button
                  type="button"
                  className="dc-gc-header__edit"
                  title="Channel settings"
                  onClick={() => setChannelSettings(activeChannel)}
                >
                  <IconSettings size={18} />
                </button>
              )}
            </header>

            {!hasGroupKey && (
              <div className="dc-gc-banner">
                {isAdmin
                  ? "Missing group encryption key on this device. Open Server Settings → Encryption to generate a new key (old messages stay locked)."
                  : "Missing group encryption key. Ask an admin to re-share the key."}
              </div>
            )}

            <div className="dc-gc-messages">
              {messages.length === 0 ? (
                <div className="dc-gc-welcome">
                  <h3>Welcome to #{activeChannel.name}!</h3>
                  <p>This is the start of the #{activeChannel.name} channel.</p>
                </div>
              ) : (
                <>
                  {hasMoreMessages && (
                    <button
                      type="button"
                      className="dc-gc-messages__older"
                      disabled={loadingOlder}
                      onClick={() => void loadOlderMessages()}
                    >
                      {loadingOlder ? "Loading older messages…" : "Load older messages"}
                    </button>
                  )}
                  {messages.map((m) => (
                    <div key={m.id} className="dc-gc-msg">
                      <span className="dc-gc-msg__avatar">{m.username[0]}</span>
                      <div className="dc-gc-msg__body">
                        <div className="dc-gc-msg__meta">
                          <span className="dc-gc-msg__author">{m.username}</span>
                          <span className="dc-gc-msg__time">
                            {new Date(m.time).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className={`dc-gc-msg__text${m.failed ? " dc-gc-msg__text--failed" : ""}`}>
                          <MarkdownText text={m.text} />
                        </p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            <form
              className="dc-gc-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
            >
              <div className="dc-composer__bar">
                <MarkdownComposerField
                  value={draft}
                  onChange={setDraft}
                  fieldClassName="dc-composer-field"
                  inputClassName="dc-composer__input"
                  placeholder={
                    hasGroupKey
                      ? `Message #${activeChannel.name} (${MESSAGE_MARKDOWN_HINT})`
                      : "Waiting for encryption key…"
                  }
                  disabled={sending || !hasGroupKey}
                  rows={1}
                />
                <button
                  type="submit"
                  className="dc-composer__send"
                  disabled={!draft.trim() || sending || !hasGroupKey}
                >
                  <IconSend size={18} />
                </button>
              </div>
            </form>
          </>
        )}

        {activeChannel?.type === "voice" && (
          <>
            <header className="dc-gc-header">
              <span className="dc-gc-header__hash">
                <ChannelTypeIcon type="voice" size={22} />
              </span>
              <h1 className="dc-gc-header__title">{activeChannel.name}</h1>
            </header>
            <div className="dc-gc-voice">
              <div className="dc-gc-voice__stage">
                <h3>Voice Channel</h3>
                <p>Hang out together with voice and video.</p>
                <button
                  type="button"
                  className={`dc-gc-voice__join${inVoice ? " dc-gc-voice__join--active" : ""}`}
                  onClick={() => void toggleVoice()}
                >
                  {inVoice ? "Disconnect" : "Join Voice"}
                </button>
              </div>
              <div className="dc-gc-voice__members">
                <h4>In channel — {voiceMembers.length}</h4>
                {voiceMembers.length === 0 ? (
                  <p className="dc-gc-voice__empty">No one is in this channel yet.</p>
                ) : (
                  <ul>
                    {voiceMembers.map((m) => (
                      <li key={m.userId}>
                        <span className="dc-gc-voice__avatar">{m.username[0]}</span>
                        {m.username}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}

        {!activeChannel && <div className="dc-gc__empty">Select a channel</div>}
      </main>

      <aside className="dc-gc-members">
        <div className="dc-gc-members__header">
          <h3>Members — {members.length}</h3>
          {isAdmin && (
            <div className="dc-gc-members__actions">
              <button
                type="button"
                className="dc-gc-members__action"
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
                className="dc-gc-members__action"
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
                className="dc-gc-members__action"
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
        <input className="dc-gc-members__search" placeholder={`Search ${displayName}`} readOnly />
        {activeMembers.length > 0 && (
          <section>
            <h3>Online — {activeMembers.length}</h3>
            <ul>
              {activeMembers.map((m) => {
                const status = friends.getPresence(m.userId);
                return (
                  <li key={m.userId}>
                    <button
                      type="button"
                      className={`dc-gc-members__row${profileMember?.userId === m.userId ? " dc-gc-members__row--active" : ""}`}
                      onClick={(e) => openMemberProfile(m, e)}
                    >
                      <span className="dc-gc-members__avatar">{m.username[0]}</span>
                      <span>{m.username}</span>
                      {m.role === "admin" && <span className="dc-gc-members__badge">Admin</span>}
                      <PresenceDot status={status} className="dc-gc-members__dot" />
                      <span className="dc-gc-members__status">{presenceLabel(status)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <section>
          <h3>Offline — {offlineMembers.length}</h3>
          <ul>
            {offlineMembers.map((m) => {
              const status = friends.getPresence(m.userId);
              return (
                <li key={m.userId} className="dc-gc-members__offline">
                  <button
                    type="button"
                    className={`dc-gc-members__row${profileMember?.userId === m.userId ? " dc-gc-members__row--active" : ""}`}
                    onClick={(e) => openMemberProfile(m, e)}
                  >
                    <span className="dc-gc-members__avatar">{m.username[0]}</span>
                    <span>{m.username}</span>
                    {m.role === "admin" && <span className="dc-gc-members__badge">Admin</span>}
                    <PresenceDot status={status} className="dc-gc-members__dot" />
                    <span className="dc-gc-members__status">{presenceLabel(status)}</span>
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
          status={friends.getPresence(profileMember.userId)}
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
                  await friends.refresh();
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
                  await kickCommunityMember(token, groupId, profileMember.userId);
                  setMembers((prev) => prev.filter((x) => x.userId !== profileMember.userId));
                  setProfileMember(null);
                }
              : undefined
          }
          onPromote={
            isAdmin && profileMember.role !== "admin"
              ? async () => {
                  await promoteCommunityMember(token, groupId, profileMember.userId);
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
                  await demoteCommunityMember(token, groupId, profileMember.userId);
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
                  await handleShareKeyWithMember(profileMember.userId);
                }
              : undefined
          }
        />
      )}

      {settingsOpen && isAdmin && (
        <CommunitySettingsModal
          communityId={groupId}
          communityName={displayName}
          token={token}
          userId={userId}
          isAdmin={isAdmin}
          isOwner={isOwner}
          friends={friends.friends}
          resharing={resharing}
          hasEncryptionKey={hasGroupKey}
          initialTab={settingsTab}
          onClose={() => setSettingsOpen(false)}
          onUpdated={(patch) => {
            if (patch.name) setDisplayName(patch.name);
          }}
          onReshareKey={handleReshareKey}
          onResetEncryptionKey={handleResetEncryptionKey}
          onShareKeyWithMember={handleShareKeyWithMember}
          onMembersChanged={() => void refreshMembers()}
        />
      )}

      {createChannel && isAdmin && (
        <CreateChannelModal
          token={token}
          communityId={groupId}
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
