import type { FriendPick } from "@vaultchat/client";
import {
  addCommunityMember,
  createCommunityInvite,
  fetchGroupMembers,
  friendlyError,
  kickCommunityMember,
  listCommunityInvites,
  parseMemberUsernames,
  promoteCommunityMember,
  updateCommunity,
} from "@vaultchat/client";
import type { GroupMemberInfo, InviteInfo } from "@vaultchat/protocol";
import { useCallback, useEffect, useState } from "react";
import { FriendMembersInput } from "./FriendMembersInput.js";
import { IconClose } from "./CommunityIcons.js";

export type CommunitySettingsTab = "overview" | "members" | "invites";

const TAB_LABELS: Record<CommunitySettingsTab, string> = {
  overview: "Overview",
  members: "Members",
  invites: "Invites",
};

export function CommunitySettingsModal({
  communityId,
  communityName,
  communityDescription,
  token,
  userId,
  isAdmin,
  friends,
  onClose,
  onUpdated,
  onReshareKey,
  onShareKeyWithMember,
  onMembersChanged,
  resharing,
  initialTab = "overview",
}: {
  communityId: string;
  communityName: string;
  communityDescription?: string;
  token: string;
  userId: string;
  isAdmin: boolean;
  friends: FriendPick[];
  onClose: () => void;
  onUpdated: (patch: { name?: string; description?: string }) => void;
  onReshareKey: () => Promise<void>;
  onShareKeyWithMember: (targetUserId: string) => Promise<void>;
  onMembersChanged?: () => void;
  resharing?: boolean;
  initialTab?: CommunitySettingsTab;
}) {
  const [tab, setTab] = useState<CommunitySettingsTab>(initialTab);
  const [name, setName] = useState(communityName);
  const [description, setDescription] = useState(communityDescription ?? "");
  const [members, setMembers] = useState<GroupMemberInfo[]>([]);
  const [invites, setInvites] = useState<InviteInfo[]>([]);
  const [addMembersInput, setAddMembersInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const tabs: CommunitySettingsTab[] = isAdmin
    ? ["overview", "members", "invites"]
    : ["overview"];

  useEffect(() => {
    if (!isAdmin && tab !== "overview") setTab("overview");
  }, [isAdmin, tab]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const memberList = await fetchGroupMembers(token, communityId);
      setMembers(memberList);
      if (isAdmin) {
        const inviteList = await listCommunityInvites(token, communityId);
        setInvites(inviteList);
      } else {
        setInvites([]);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [token, communityId, isAdmin]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSaveOverview() {
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateCommunity(token, communityId, {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      onUpdated({
        name: updated.name,
        description: updated.description,
      });
      setSuccess("Server settings saved");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMembers() {
    const usernames = parseMemberUsernames(addMembersInput);
    if (usernames.length === 0) return;
    setAdding(true);
    setError(null);
    try {
      for (const username of usernames) {
        const member = await addCommunityMember(token, communityId, { username });
        try {
          await onShareKeyWithMember(member.userId);
        } catch {
          // Member added but key share failed — admin can reshare from overview
        }
      }
      setAddMembersInput("");
      setSuccess(`Added ${usernames.length} member(s) and sent encryption keys`);
      await loadData();
      onMembersChanged?.();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setAdding(false);
    }
  }

  async function handleCreateInvite() {
    setCreatingInvite(true);
    setError(null);
    try {
      const invite = await createCommunityInvite(token, communityId, { expiresInHours: 168 });
      setInvites((prev) => [invite, ...prev]);
      setSuccess("Invite code created — share it so others can join");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleKick(targetUserId: string, targetUsername: string) {
    if (!window.confirm(`Remove ${targetUsername} from this group?`)) return;
    setError(null);
    try {
      await kickCommunityMember(token, communityId, targetUserId);
      setMembers((prev) => prev.filter((m) => m.userId !== targetUserId));
      setSuccess(`${targetUsername} removed`);
      onMembersChanged?.();
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  async function handlePromote(targetUserId: string) {
    setError(null);
    try {
      await promoteCommunityMember(token, communityId, targetUserId);
      setMembers((prev) =>
        prev.map((m) => (m.userId === targetUserId ? { ...m, role: "admin" as const } : m))
      );
      setSuccess("Member promoted to admin");
      onMembersChanged?.();
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  async function copyInviteCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setSuccess("Invite code copied to clipboard");
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  function renderOverview() {
    return (
      <div className="vc-server-settings__sections">
        <section className="vc-server-settings__card">
          <h3 className="vc-server-settings__card-title">Server Profile</h3>
          <p className="vc-server-settings__card-desc">
            Customize how your server appears to members.
          </p>

          <label className="vc-server-settings__field">
            <span className="vc-server-settings__label">Server name</span>
            <input
              className="vc-server-settings__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              readOnly={!isAdmin}
              placeholder="My awesome server"
            />
            {isAdmin && (
              <span className="vc-server-settings__field-meta">{name.length}/64</span>
            )}
          </label>

          <label className="vc-server-settings__field">
            <span className="vc-server-settings__label">Description</span>
            <textarea
              className="vc-server-settings__textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Tell people what this server is about…"
              readOnly={!isAdmin}
            />
          </label>

          {isAdmin && (
            <div className="vc-server-settings__actions">
              <button
                type="button"
                className="vc-btn vc-btn--primary"
                onClick={() => void handleSaveOverview()}
                disabled={saving || !name.trim()}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
        </section>

        {isAdmin && (
          <section className="vc-server-settings__card">
            <h3 className="vc-server-settings__card-title">Encryption</h3>
            <p className="vc-server-settings__card-desc">
              Messages are end-to-end encrypted with a shared key on each member&apos;s device. If
              someone can&apos;t read messages, re-share the key with all members.
            </p>
            <button
              type="button"
              className="vc-btn vc-btn--secondary"
              onClick={() => void onReshareKey()}
              disabled={resharing}
            >
              {resharing ? "Sharing…" : "Re-share encryption key"}
            </button>
          </section>
        )}
      </div>
    );
  }

  function renderMembers() {
    return (
      <div className="vc-server-settings__sections">
        <section className="vc-server-settings__card">
          <h3 className="vc-server-settings__card-title">Add members</h3>
          <p className="vc-server-settings__card-desc">
            Search friends or enter usernames. New members receive the encryption key automatically.
          </p>
          <div className="vc-server-settings__add-row">
            <FriendMembersInput
              friends={friends}
              value={addMembersInput}
              onChange={setAddMembersInput}
              placeholder="Search friends or @username"
              inputClassName="vc-server-settings__input"
              className="vc-server-settings__friend-input"
            />
            <button
              type="button"
              className="vc-btn vc-btn--primary vc-server-settings__add-btn"
              onClick={() => void handleAddMembers()}
              disabled={adding || !addMembersInput.trim()}
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
        </section>

        <section className="vc-server-settings__card">
          <div className="vc-server-settings__card-header">
            <h3 className="vc-server-settings__card-title">Members</h3>
            <span className="vc-server-settings__count">{members.length}</span>
          </div>

          <ul className="vc-server-settings__member-list">
            {members.map((m) => (
              <li key={m.userId} className="vc-server-settings__member">
                <span className="vc-server-settings__member-avatar" aria-hidden>
                  {m.username[0]?.toUpperCase()}
                </span>
                <div className="vc-server-settings__member-info">
                  <span className="vc-server-settings__member-name">{m.username}</span>
                  <span
                    className={`vc-server-settings__member-role${m.role === "admin" ? " vc-server-settings__member-role--admin" : ""}`}
                  >
                    {m.role === "admin" ? "Admin" : "Member"}
                    {m.userId === userId ? " · You" : ""}
                  </span>
                </div>
                {m.userId !== userId && m.role !== "admin" && (
                  <div className="vc-server-settings__member-actions">
                    <button
                      type="button"
                      className="vc-server-settings__member-action"
                      onClick={() => void handlePromote(m.userId)}
                    >
                      Promote
                    </button>
                    <button
                      type="button"
                      className="vc-server-settings__member-action vc-server-settings__member-action--danger"
                      onClick={() => void handleKick(m.userId, m.username)}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  function renderInvites() {
    return (
      <div className="vc-server-settings__sections">
        <section className="vc-server-settings__card">
          <h3 className="vc-server-settings__card-title">Create an invite</h3>
          <p className="vc-server-settings__card-desc">
            Generate a code that lets others join this server. Codes expire after 7 days.
          </p>
          <button
            type="button"
            className="vc-btn vc-btn--primary"
            onClick={() => void handleCreateInvite()}
            disabled={creatingInvite}
          >
            {creatingInvite ? "Creating…" : "Create invite code"}
          </button>
        </section>

        <section className="vc-server-settings__card">
          <div className="vc-server-settings__card-header">
            <h3 className="vc-server-settings__card-title">Active invites</h3>
            <span className="vc-server-settings__count">{invites.length}</span>
          </div>

          {invites.length === 0 ? (
            <p className="vc-server-settings__empty">No invite codes yet. Create one above.</p>
          ) : (
            <ul className="vc-server-settings__invite-list">
              {invites.map((inv) => (
                <li key={inv.id} className="vc-server-settings__invite">
                  <div className="vc-server-settings__invite-code-wrap">
                    <code className="vc-server-settings__invite-code">{inv.code}</code>
                    <span className="vc-server-settings__invite-meta">
                      {inv.useCount} use{inv.useCount === 1 ? "" : "s"}
                      {inv.expiresAt
                        ? ` · expires ${new Date(inv.expiresAt).toLocaleDateString()}`
                        : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="vc-btn vc-btn--secondary vc-server-settings__copy-btn"
                    onClick={() => void copyInviteCode(inv.code)}
                  >
                    Copy
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="vc-server-settings-overlay" role="dialog" aria-modal aria-label="Server settings">
      <div className="vc-server-settings">
        <nav className="vc-server-settings__nav" aria-label="Server settings navigation">
          <div className="vc-server-settings__nav-header">
            <span className="vc-server-settings__nav-icon" aria-hidden>
              {communityName[0]?.toUpperCase() ?? "S"}
            </span>
            <div className="vc-server-settings__nav-meta">
              <span className="vc-server-settings__nav-label">Server</span>
              <span className="vc-server-settings__nav-name">{communityName}</span>
            </div>
          </div>

          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              className={`vc-server-settings__nav-item${tab === t ? " vc-server-settings__nav-item--active" : ""}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>

        <div className="vc-server-settings__main">
          <header className="vc-server-settings__header">
            <h2>{TAB_LABELS[tab]}</h2>
            <button
              type="button"
              className="vc-server-settings__close"
              onClick={onClose}
              aria-label="Close server settings"
            >
              <IconClose size={18} />
              <span className="vc-server-settings__esc">ESC</span>
            </button>
          </header>

          <div className="vc-server-settings__body">
            {error && (
              <div className="vc-banner vc-banner--warning" role="alert">
                {error}
              </div>
            )}
            {success && (
              <div className="vc-banner vc-banner--info" role="status">
                {success}
                <button type="button" className="vc-banner__dismiss" onClick={() => setSuccess(null)}>
                  <IconClose size={14} />
                </button>
              </div>
            )}

            {loading ? (
              <div className="vc-server-settings__loading">
                <div className="vc-spinner" />
                <p>Loading settings…</p>
              </div>
            ) : (
              <>
                {tab === "overview" && renderOverview()}
                {tab === "members" && renderMembers()}
                {tab === "invites" && renderInvites()}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
