"use client";

import { useState } from "react";
import type { GroupInfo } from "@vaultchat/protocol";
import type { FriendPick } from "@vaultchat/client";
import { FriendMembersInput } from "@vaultchat/chat-react";
import { friendlyError } from "@/lib/errors";

type GroupsTab = "all" | "create" | "join";

interface GroupsListProps {
  groups: GroupInfo[];
  friends: FriendPick[];
  groupName: string;
  groupMembers: string;
  onGroupNameChange: (v: string) => void;
  onGroupMembersChange: (v: string) => void;
  onCreate: () => void;
  onRedeemInvite: (code: string) => Promise<void>;
  onSelect: (groupId: string, groupName: string) => void;
  loading: boolean;
  creating: boolean;
}

export function GroupsList({
  groups,
  friends,
  groupName,
  groupMembers,
  onGroupNameChange,
  onGroupMembersChange,
  onCreate,
  onRedeemInvite,
  onSelect,
  loading,
  creating,
}: GroupsListProps) {
  const [tab, setTab] = useState<GroupsTab>("all");
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  async function handleJoin() {
    if (!inviteCode.trim()) return;
    setJoining(true);
    setJoinError(null);
    try {
      await onRedeemInvite(inviteCode.trim());
      setInviteCode("");
      setTab("all");
    } catch (e) {
      setJoinError(friendlyError(e));
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="vc-groups-hub">
      <header className="vc-groups-hub__header">
        <span className="vc-groups-hub__icon" aria-hidden>
          <GroupsIcon />
        </span>
        <h1 className="vc-groups-hub__title">Communities</h1>
        <div className="vc-groups-hub__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`vc-groups-hub__tab${tab === "all" ? " vc-groups-hub__tab--active" : ""}`}
            onClick={() => setTab("all")}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            className={`vc-groups-hub__tab${tab === "create" ? " vc-groups-hub__tab--active" : ""}`}
            onClick={() => setTab("create")}
          >
            Create
          </button>
          <button
            type="button"
            role="tab"
            className={`vc-groups-hub__tab vc-groups-hub__tab--action${tab === "join" ? " vc-groups-hub__tab--active" : ""}`}
            onClick={() => setTab("join")}
          >
            Join
          </button>
        </div>
      </header>

      <div className="vc-groups-hub__body">
        {tab === "all" && (
          <section className="vc-groups-hub__section">
            {loading ? (
              <div className="vc-loading">
                <div className="vc-spinner" />
              </div>
            ) : groups.length === 0 ? (
              <div className="vc-groups-hub__empty">
                <div className="vc-groups-hub__empty-icon">
                  <GroupsIcon />
                </div>
                <h2>No communities yet</h2>
                <p>Create a community or join with an invite code to get started.</p>
                <div className="vc-groups-hub__empty-actions">
                  <button type="button" className="vc-btn" onClick={() => setTab("create")}>
                    Create community
                  </button>
                  <button type="button" className="vc-btn vc-btn--ghost" onClick={() => setTab("join")}>
                    Join with code
                  </button>
                </div>
              </div>
            ) : (
              <ul className="vc-groups-grid">
                {groups.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      className="vc-groups-card"
                      onClick={() => onSelect(g.id, g.name)}
                    >
                      <span className="vc-groups-card__avatar">{g.name[0]?.toUpperCase()}</span>
                      <span className="vc-groups-card__info">
                        <span className="vc-groups-card__name">{g.name}</span>
                        <span className="vc-groups-card__meta">
                          {g.memberCount} members · End-to-end encrypted
                        </span>
                      </span>
                      <span className="vc-groups-card__arrow" aria-hidden>
                        ›
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "create" && (
          <section className="vc-groups-hub__section vc-groups-hub__form">
            <h2 className="vc-groups-hub__section-title">Create a community</h2>
            <p className="vc-groups-hub__hint">
              Group keys are distributed via encrypted direct messages to each member.
            </p>
            <label className="vc-groups-hub__label">
              Community name
              <input
                className="vc-groups-hub__input"
                placeholder="My community"
                value={groupName}
                onChange={(e) => onGroupNameChange(e.target.value)}
              />
            </label>
            <label className="vc-groups-hub__label">
              Members
              <FriendMembersInput
                friends={friends}
                value={groupMembers}
                onChange={onGroupMembersChange}
                placeholder="Add friends by username…"
                disabled={creating}
                className="vc-friend-members"
                inputClassName="vc-groups-hub__input vc-friend-members__input"
              />
            </label>
            <button
              type="button"
              className="vc-btn vc-btn--block"
              disabled={creating || !groupName.trim()}
              onClick={onCreate}
            >
              {creating ? "Creating…" : "Create community"}
            </button>
          </section>
        )}

        {tab === "join" && (
          <section className="vc-groups-hub__section vc-groups-hub__form">
            <h2 className="vc-groups-hub__section-title">Join with invite</h2>
            <p className="vc-groups-hub__hint">Enter an invite code shared by a community admin.</p>
            {joinError && (
              <p className="vc-groups-hub__error" role="alert">
                {joinError}
              </p>
            )}
            <label className="vc-groups-hub__label">
              Invite code
              <input
                className="vc-groups-hub__input"
                placeholder="Paste invite code"
                value={inviteCode}
                onChange={(e) => {
                  setInviteCode(e.target.value);
                  setJoinError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && void handleJoin()}
              />
            </label>
            <button
              type="button"
              className="vc-btn vc-btn--block"
              disabled={joining || !inviteCode.trim()}
              onClick={() => void handleJoin()}
            >
              {joining ? "Joining…" : "Join community"}
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
