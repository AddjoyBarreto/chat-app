import { fetchGroups, friendlyError, parseMemberUsernames, redeemInvite } from "@vaultchat/client";
import type { FriendPick } from "@vaultchat/client";
import type { GroupInfo } from "@vaultchat/protocol";
import { FriendMembersInput } from "@vaultchat/chat-react";
import { useCallback, useEffect, useState } from "react";
import { createGroupWithKey, loadUserDevice } from "./groupHelpers";

type GroupsTab = "all" | "create" | "join";

export function GroupsPanel({
  authToken,
  userId,
  username,
  deviceId,
  friends,
  onSelectGroup,
  onGroupsChanged,
}: {
  authToken: string;
  userId: string;
  username: string;
  deviceId: number;
  friends: FriendPick[];
  onSelectGroup?: (groupId: string, name: string) => void;
  onGroupsChanged?: () => void;
}) {
  const [tab, setTab] = useState<GroupsTab>("all");
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState("");
  const [creating, setCreating] = useState(false);

  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGroups(await fetchGroups(authToken));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate() {
    if (!groupName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const memberUsernames = parseMemberUsernames(members);
      const device = await loadUserDevice(authToken, userId, username, deviceId);
      await createGroupWithKey(
        authToken,
        userId,
        username,
        deviceId,
        device,
        groupName.trim(),
        memberUsernames
      );
      setGroupName("");
      setMembers("");
      setTab("all");
      await refresh();
      onGroupsChanged?.();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin() {
    if (!inviteCode.trim()) return;
    setJoining(true);
    setError(null);
    try {
      await redeemInvite(authToken, inviteCode.trim());
      setInviteCode("");
      setTab("all");
      await refresh();
      onGroupsChanged?.();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="dc-hub">
      <header className="dc-hub__header">
        <span className="dc-hub__header-icon" aria-hidden>
          <GroupsIcon />
        </span>
        <h1 className="dc-hub__title">Groups</h1>
        <div className="dc-hub__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`dc-hub__tab${tab === "all" ? " dc-hub__tab--active" : ""}`}
            onClick={() => setTab("all")}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            className={`dc-hub__tab${tab === "create" ? " dc-hub__tab--active" : ""}`}
            onClick={() => setTab("create")}
          >
            Create
          </button>
          <button
            type="button"
            role="tab"
            className={`dc-hub__tab dc-hub__tab--action${tab === "join" ? " dc-hub__tab--active" : ""}`}
            onClick={() => setTab("join")}
          >
            Join
          </button>
        </div>
      </header>

      <div className="dc-hub__body">
        {error && (
          <p className="dc-hub__error" role="alert">
            {error}
          </p>
        )}

        {tab === "all" && (
          <section className="dc-hub__section">
            {loading ? (
              <p className="dc-hub__empty">Loading groups…</p>
            ) : groups.length === 0 ? (
              <div className="dc-hub__empty-state">
                <div className="dc-hub__empty-icon">
                  <GroupsIcon />
                </div>
                <h2>No groups yet</h2>
                <p>Create a group or join with an invite code to get started.</p>
              </div>
            ) : (
              <ul className="dc-hub__user-list">
                {groups.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      className="dc-hub__user-row"
                      onClick={() => onSelectGroup?.(g.id, g.name)}
                    >
                      <span className="dc-hub__avatar dc-hub__avatar--group">
                        {g.name[0]?.toUpperCase()}
                      </span>
                      <span className="dc-hub__user-info">
                        <span className="dc-hub__user-name">{g.name}</span>
                        <span className="dc-hub__user-sub">
                          {g.memberCount} members · End-to-end encrypted
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "create" && (
          <section className="dc-hub__section dc-hub__form">
            <h2 className="dc-hub__section-title">Create a group</h2>
            <p className="dc-hub__hint">
              Group keys are distributed via encrypted direct messages to each member.
            </p>
            <label className="dc-hub__label">
              Group name
              <input
                className="dc-hub__input"
                placeholder="My group"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </label>
            <label className="dc-hub__label">
              Members
              <FriendMembersInput
                friends={friends}
                value={members}
                onChange={setMembers}
                placeholder="username1, username2"
                disabled={creating}
                className="vc-friend-members vc-friend-members--dc"
                inputClassName="dc-hub__input vc-friend-members__input"
              />
            </label>
            <button
              type="button"
              className="dc-hub__primary-btn"
              disabled={creating || !groupName.trim()}
              onClick={() => void handleCreate()}
            >
              {creating ? "Creating…" : "Create Group"}
            </button>
          </section>
        )}

        {tab === "join" && (
          <section className="dc-hub__section dc-hub__form">
            <h2 className="dc-hub__section-title">Join with invite</h2>
            <p className="dc-hub__hint">Enter an invite code shared by a group admin.</p>
            <label className="dc-hub__label">
              Invite code
              <input
                className="dc-hub__input"
                placeholder="Paste invite code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleJoin()}
              />
            </label>
            <button
              type="button"
              className="dc-hub__primary-btn"
              disabled={joining || !inviteCode.trim()}
              onClick={() => void handleJoin()}
            >
              {joining ? "Joining…" : "Join Group"}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

function GroupsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  );
}
