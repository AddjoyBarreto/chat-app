"use client";

import { useState } from "react";
import type { GroupInfo } from "@vaultchat/protocol";
import { friendlyError } from "@/lib/errors";

interface GroupsListProps {
  groups: GroupInfo[];
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
    } catch (e) {
      setJoinError(friendlyError(e));
    } finally {
      setJoining(false);
    }
  }

  return (
    <>
      <section className="vc-friends__section">
        <h2 className="vc-friends__title">Join community</h2>
        {joinError && (
          <p className="vc-friends__error" role="alert">
            {joinError}
          </p>
        )}
        <div className="vc-search">
          <input
            className="vc-search__input"
            placeholder="Invite code"
            value={inviteCode}
            onChange={(e) => {
              setInviteCode(e.target.value);
              setJoinError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && void handleJoin()}
          />
          <button
            type="button"
            className="vc-btn vc-btn--sm"
            disabled={joining || !inviteCode.trim()}
            onClick={() => void handleJoin()}
          >
            {joining ? "Joining…" : "Join"}
          </button>
        </div>
      </section>

      <div className="vc-groups-create">
        <input
          className="vc-groups-create__input"
          placeholder="Group name"
          value={groupName}
          onChange={(e) => onGroupNameChange(e.target.value)}
        />
        <input
          className="vc-groups-create__input"
          placeholder="Members (usernames, comma-separated)"
          value={groupMembers}
          onChange={(e) => onGroupMembersChange(e.target.value)}
          autoCapitalize="off"
        />
        <button
          type="button"
          className="vc-btn"
          onClick={onCreate}
          disabled={creating || !groupName.trim()}
        >
          {creating ? "Creating…" : "Create group"}
        </button>
      </div>

      {loading ? (
        <div className="vc-loading">
          <div className="vc-spinner" />
        </div>
      ) : groups.length === 0 ? (
        <div className="vc-empty">
          <div className="vc-empty__icon">👥</div>
          <h2 className="vc-empty__title">No groups yet</h2>
          <p className="vc-empty__text">
            Create a group above. Keys are distributed via encrypted direct messages.
          </p>
        </div>
      ) : (
        <ul className="vc-chat-list">
          {groups.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                className="vc-chat-item"
                onClick={() => onSelect(g.id, g.name)}
              >
                <div className="vc-chat-item__avatar">👥</div>
                <div className="vc-chat-item__body">
                  <div className="vc-chat-item__name">{g.name}</div>
                  <div className="vc-chat-item__preview">
                    {g.memberCount} members · 🔒 E2EE
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
