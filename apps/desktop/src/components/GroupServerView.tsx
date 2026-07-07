import type { useFriends } from "@vaultchat/chat-react";
import type { CommunitySettingsTab } from "@vaultchat/chat-react";
import { ChannelSettingsModal, CommunityChannelSidebar, CommunitySettingsModal, CreateChannelModal, ChannelTypeIcon, IconInvite, IconPlus, IconSend, IconSettings, MarkdownText, MarkdownComposerField, PresenceDot } from "@vaultchat/chat-react";
import {
  createChannelCategory,
  createGroup,
  createLocalStorageAdapter,
  decryptGroupEnvelope,
  deleteCommunityChannel,
  distributeGroupKey,
  fetchChannelCategories,
  fetchCommunityChannels,
  fetchGroupMembers,
  fetchGroupMessages,
  fetchVoicePresence,
  friendlyError,
  joinVoiceChannel,
  leaveVoiceChannel,
  loadDevice,
  loadGroupCipher,
  presenceLabel,
  reshareGroupKey,
  saveGroupKey,
  sendGroupContentMessage,
  shareGroupKeyWithMember,
  MESSAGE_MARKDOWN_HINT,
} from "@vaultchat/client";
import { GroupCipher, type VaultDevice } from "@vaultchat/crypto";
import type {
  ChannelCategoryInfo,
  ChannelInfo,
  ChannelType,
  GroupMemberInfo,
  VoicePresenceInfo,
  WsServerEvent,
} from "@vaultchat/protocol";
import { useCallback, useEffect, useMemo, useState } from "react";

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
}) {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const [categories, setCategories] = useState<ChannelCategoryInfo[]>([]);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [activeChannel, setActiveChannel] = useState<ChannelInfo | null>(null);
  const [members, setMembers] = useState<GroupMemberInfo[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
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

  const me = members.find((m) => m.userId === userId);
  const isAdmin = me?.role === "admin";

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

  const loadMessages = useCallback(async () => {
    const { messages: envelopes } = await fetchGroupMessages(token, groupId);
    const memberMap = new Map(members.map((m) => [m.userId, m.username]));
    const parsed: GroupMessage[] = [];
    for (const envelope of envelopes) {
      const msg = await decryptGroupEnvelope(storage, groupId, envelope, userId);
      const author = memberMap.get(envelope.senderId) ?? envelope.senderId.slice(0, 8);
      parsed.push({
        id: msg.id,
        from: msg.from,
        username: msg.from === "me" ? username : author,
        text: msg.text,
        time: msg.time,
        failed: msg.failed,
      });
    }
    setMessages(parsed);
  }, [token, groupId, storage, userId, username, members]);

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
        const [memberList, ch] = await Promise.all([
          fetchGroupMembers(token, groupId),
          refreshChannels(),
        ]);
        if (cancelled) return;
        setMembers(memberList);
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
    if (!activeChannel || activeChannel.type !== "text") return;
    void loadMessages().catch((e) => setError(friendlyError(e)));
  }, [activeChannel, loadMessages]);

  useEffect(() => {
    if (!activeChannel || activeChannel.type !== "voice") return;
    void refreshVoice(activeChannel.id).catch(() => {});
  }, [activeChannel, refreshVoice]);

  useEffect(() => {
    if (!onServerEventRef) return;
    const handler = (event: WsServerEvent) => {
      if (event.type === "group_message" && event.envelope.groupId === groupId) {
        void (async () => {
          const msg = await decryptGroupEnvelope(storage, groupId, event.envelope, userId);
          const author =
            members.find((m) => m.userId === event.envelope.senderId)?.username ??
            event.envelope.senderId.slice(0, 8);
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
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
    if (!draft.trim() || !hasGroupKey) return;
    setSending(true);
    try {
      await sendGroupContentMessage(
        storage,
        userId,
        token,
        groupId,
        { type: "text", text: draft.trim() },
        "text"
      );
      setDraft("");
      await loadMessages();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
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
                Missing group encryption key. Ask an admin to re-share the key.
              </div>
            )}

            <div className="dc-gc-messages">
              {messages.length === 0 ? (
                <div className="dc-gc-welcome">
                  <h3>Welcome to #{activeChannel.name}!</h3>
                  <p>This is the start of the #{activeChannel.name} channel.</p>
                </div>
              ) : (
                messages.map((m) => (
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
                ))
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
              {activeMembers.map((m) => (
                <li key={m.userId}>
                  <span className="dc-gc-members__avatar">{m.username[0]}</span>
                  <span>{m.username}</span>
                  <PresenceDot status={friends.getPresence(m.userId)} className="dc-gc-members__dot" />
                  <span className="dc-gc-members__status">{presenceLabel(friends.getPresence(m.userId))}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h3>Offline — {offlineMembers.length}</h3>
          <ul>
            {offlineMembers.map((m) => (
              <li key={m.userId} className="dc-gc-members__offline">
                <span className="dc-gc-members__avatar">{m.username[0]}</span>
                <span>{m.username}</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      {settingsOpen && isAdmin && (
        <CommunitySettingsModal
          communityId={groupId}
          communityName={displayName}
          token={token}
          userId={userId}
          isAdmin={isAdmin}
          friends={friends.friends}
          resharing={resharing}
          initialTab={settingsTab}
          onClose={() => setSettingsOpen(false)}
          onUpdated={(patch) => {
            if (patch.name) setDisplayName(patch.name);
          }}
          onReshareKey={handleReshareKey}
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

export async function createGroupWithKey(
  token: string,
  userId: string,
  username: string,
  deviceId: number,
  device: VaultDevice,
  name: string,
  memberUsernames: string[]
) {
  const storage = createLocalStorageAdapter();
  const group = await createGroup(token, { name, memberUsernames });
  const { keyBase64 } = await GroupCipher.generate();
  await saveGroupKey(storage, userId, group.id, keyBase64);
  await distributeGroupKey(storage, token, device, userId, group.id, keyBase64);
  return group;
}

export async function loadUserDevice(
  token: string,
  userId: string,
  username: string,
  deviceId: number
) {
  const storage = createLocalStorageAdapter();
  return loadDevice(storage, { userId, username, token, deviceId });
}
