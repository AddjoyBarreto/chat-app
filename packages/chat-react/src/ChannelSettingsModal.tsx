import {
  addChannelMember,
  deleteCommunityChannel,
  fetchChannelMembers,
  friendlyError,
  removeChannelMember,
  updateCommunityChannel,
} from "@vaultchat/client";
import type { ChannelInfo, GroupMemberInfo } from "@vaultchat/protocol";
import { useCallback, useEffect, useState } from "react";

type SettingsTab = "overview" | "permissions";

export function ChannelSettingsModal({
  channel,
  token,
  communityMembers,
  onClose,
  onUpdated,
  onDeleted,
}: {
  channel: ChannelInfo;
  token: string;
  communityMembers: GroupMemberInfo[];
  onClose: () => void;
  onUpdated: (channel: ChannelInfo) => void;
  onDeleted?: (channelId: string) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("overview");
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic ?? "");
  const [isPrivate, setIsPrivate] = useState(channel.isPrivate ?? false);
  const [channelMembers, setChannelMembers] = useState<{ userId: string; username: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const members = await fetchChannelMembers(token, channel.id);
      setChannelMembers(members);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [token, channel.id]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const availableToAdd = communityMembers.filter(
    (m) => m.role !== "admin" && !channelMembers.some((cm) => cm.userId === m.userId)
  );

  const selectedMember = communityMembers.find((m) => m.userId === selectedUserId);
  const communityAdmins = communityMembers.filter((m) => m.role === "admin");

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateCommunityChannel(token, channel.id, {
        name: name.trim(),
        topic: topic.trim() || undefined,
        isPrivate,
      });
      onUpdated(updated);
      setSuccess("Channel settings saved");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMember() {
    if (!selectedUserId) return;
    setAddingMember(true);
    setError(null);
    try {
      const member = await addChannelMember(token, channel.id, { userId: selectedUserId });
      setChannelMembers((prev) => [...prev, member]);
      setSelectedUserId("");
      setSuccess(`${member.username} added to channel`);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setAddingMember(false);
    }
  }

  async function handleRemoveMember(userId: string, username: string) {
    setRemovingUserId(userId);
    setError(null);
    try {
      await removeChannelMember(token, channel.id, userId);
      setChannelMembers((prev) => prev.filter((m) => m.userId !== userId));
      setSuccess(`${username} removed from channel`);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setRemovingUserId(null);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `Delete #${channel.name}? This cannot be undone. Messages in this channel will be lost.`
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteCommunityChannel(token, channel.id);
      onDeleted?.(channel.id);
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setDeleting(false);
    }
  }

  const channelIcon = channel.type === "voice" ? "🔊" : "#";
  const categoryLabel =
    channel.type === "voice" ? "VOICE CHANNELS" : "TEXT CHANNELS";

  return (
    <div
      className="vc-community-settings-overlay"
      role="dialog"
      aria-modal
      aria-label="Channel settings"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="vc-channel-settings">
        <nav className="vc-channel-settings__nav" aria-label="Channel settings navigation">
          <div className="vc-channel-settings__nav-header">
            <span className="vc-channel-settings__nav-icon">{channelIcon}</span>
            <span className="vc-channel-settings__nav-label">{categoryLabel}</span>
          </div>

          <button
            type="button"
            className={`vc-channel-settings__nav-item${tab === "overview" ? " vc-channel-settings__nav-item--active" : ""}`}
            onClick={() => setTab("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            className={`vc-channel-settings__nav-item${tab === "permissions" ? " vc-channel-settings__nav-item--active" : ""}`}
            onClick={() => setTab("permissions")}
          >
            Permissions
          </button>

          {onDeleted && (
            <button
              type="button"
              className="vc-channel-settings__nav-delete"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              <span>🗑</span> Delete Channel
            </button>
          )}
        </nav>

        <div className="vc-channel-settings__main">
          <header className="vc-channel-settings__header">
            <h2>{tab === "overview" ? "Overview" : "Permissions"}</h2>
            <button
              type="button"
              className="vc-channel-settings__close"
              onClick={onClose}
              aria-label="Close"
            >
              <span aria-hidden>✕</span>
              <span className="vc-channel-settings__esc">ESC</span>
            </button>
          </header>

          <div className="vc-channel-settings__body">
            {error && (
              <div className="vc-banner vc-banner--warning" role="alert">
                {error}
              </div>
            )}
            {success && (
              <div className="vc-banner vc-banner--info" role="status">
                {success}
                <button type="button" className="vc-banner__dismiss" onClick={() => setSuccess(null)}>
                  ✕
                </button>
              </div>
            )}

            {tab === "overview" && (
              <section className="vc-community-settings__section">
                <label className="vc-community-settings__field">
                  <span>Channel Name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} />
                </label>

                {channel.type === "text" && (
                  <label className="vc-community-settings__field">
                    <span>Topic</span>
                    <input
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="Let everyone know what this channel is about"
                    />
                  </label>
                )}

                <div className="vc-channel-settings__save-row">
                  <button
                    type="button"
                    className="vc-btn vc-btn--primary"
                    onClick={() => void handleSave()}
                    disabled={saving || name.trim().length < 2}
                  >
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </section>
            )}

            {tab === "permissions" && (
              <section className="vc-community-settings__section">
                <div className="vc-channel-settings__perm-row">
                  <div>
                    <strong>Private Channel</strong>
                    <p className="vc-community-settings__hint">
                      Only admins and selected members can view and access this channel.
                    </p>
                  </div>
                  <label className="vc-channel-settings__switch">
                    <input
                      type="checkbox"
                      checked={isPrivate}
                      onChange={(e) => setIsPrivate(e.target.checked)}
                    />
                    <span className="vc-channel-settings__switch-track" />
                  </label>
                </div>

                <div className="vc-channel-settings__save-row">
                  <button
                    type="button"
                    className="vc-btn vc-btn--secondary"
                    onClick={() => void handleSave()}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Save privacy setting"}
                  </button>
                </div>

                {isPrivate && (
                  <>
                    <div className="vc-community-settings__divider" />
                    <h3>Channel members</h3>
                    <p className="vc-community-settings__hint">
                      Community admins always have access. Add members who should see this private
                      channel.
                    </p>

                    {loading ? (
                      <div className="vc-loading">
                        <div className="vc-spinner" />
                      </div>
                    ) : (
                      <>
                        <div className="vc-channel-settings__add-row">
                          <select
                            className={`vc-community-settings__input${selectedUserId ? " vc-channel-settings__select--has-value" : ""}`}
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                          >
                            <option value="">Select a community member…</option>
                            {availableToAdd.map((m) => (
                              <option key={m.userId} value={m.userId}>
                                @{m.username}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="vc-btn vc-btn--primary vc-channel-settings__add-btn"
                            onClick={() => void handleAddMember()}
                            disabled={!selectedUserId || addingMember}
                          >
                            {addingMember ? "Adding…" : "Add"}
                          </button>
                        </div>

                        {selectedMember && (
                          <div className="vc-channel-settings__selected">
                            <span className="vc-channel-settings__selected-avatar" aria-hidden>
                              {selectedMember.username[0]?.toUpperCase()}
                            </span>
                            <div className="vc-channel-settings__selected-info">
                              <span className="vc-channel-settings__selected-name">
                                @{selectedMember.username}
                              </span>
                              <span className="vc-channel-settings__selected-hint">
                                Ready to add — click Add to grant access
                              </span>
                            </div>
                            <button
                              type="button"
                              className="vc-channel-settings__selected-clear"
                              onClick={() => setSelectedUserId("")}
                              aria-label="Clear selection"
                            >
                              ✕
                            </button>
                          </div>
                        )}

                        {communityAdmins.length > 0 && (
                          <div className="vc-channel-settings__member-group">
                            <h4 className="vc-channel-settings__member-group-title">
                              Admins — always have access
                            </h4>
                            <ul className="vc-channel-settings__member-list">
                              {communityAdmins.map((m) => (
                                <li key={m.userId} className="vc-channel-settings__member vc-channel-settings__member--readonly">
                                  <span className="vc-channel-settings__member-avatar" aria-hidden>
                                    {m.username[0]?.toUpperCase()}
                                  </span>
                                  <div className="vc-channel-settings__member-info">
                                    <span className="vc-channel-settings__member-name">{m.username}</span>
                                    <span className="vc-channel-settings__member-role">Admin</span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="vc-channel-settings__member-group">
                          <h4 className="vc-channel-settings__member-group-title">
                            Added members — {channelMembers.length}
                          </h4>
                          {channelMembers.length === 0 ? (
                            <p className="vc-channel-settings__empty">
                              No extra members added yet. Select someone above and click Add.
                            </p>
                          ) : (
                            <ul className="vc-channel-settings__member-list">
                              {channelMembers.map((m) => (
                                <li key={m.userId} className="vc-channel-settings__member">
                                  <span className="vc-channel-settings__member-avatar" aria-hidden>
                                    {m.username[0]?.toUpperCase()}
                                  </span>
                                  <div className="vc-channel-settings__member-info">
                                    <span className="vc-channel-settings__member-name">{m.username}</span>
                                    <span className="vc-channel-settings__member-role">Member</span>
                                  </div>
                                  <button
                                    type="button"
                                    className="vc-channel-settings__member-remove"
                                    onClick={() => void handleRemoveMember(m.userId, m.username)}
                                    disabled={removingUserId === m.userId}
                                    aria-label={`Remove ${m.username} from channel`}
                                  >
                                    {removingUserId === m.userId ? "…" : "Remove"}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
