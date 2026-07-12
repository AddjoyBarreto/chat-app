"use client";

import type { GroupInfo, SettablePresenceStatus } from "@vaultchat/protocol";
import { WebUserRailPanel } from "./WebUserRailPanel";

export function WebServerRail({
  groups,
  activeGroupId,
  onSelectGroup,
  onGoHome,
  username,
  ownPresence,
  onPresenceChange,
  presenceDisabled,
  onOpenSettings,
}: {
  groups: GroupInfo[];
  activeGroupId: string | null;
  onSelectGroup: (id: string, name: string) => void;
  onGoHome: () => void;
  username: string;
  ownPresence: SettablePresenceStatus;
  onPresenceChange: (status: SettablePresenceStatus) => void;
  presenceDisabled?: boolean;
  onOpenSettings: () => void;
}) {
  return (
    <nav className="vc-server-rail" aria-label="App navigation">
      <button
        type="button"
        className={`vc-server-rail__btn${!activeGroupId ? " vc-server-rail__btn--active" : ""}`}
        onClick={onGoHome}
        title="Home"
        aria-label="Home"
      >
        <HomeIcon />
      </button>

      {groups.length > 0 && (
        <>
          <div className="vc-server-rail__divider" aria-hidden />
          <div className="vc-server-rail__groups">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`vc-server-rail__group${activeGroupId === g.id ? " vc-server-rail__group--active" : ""}`}
                title={g.name}
                aria-label={g.name}
                onClick={() => onSelectGroup(g.id, g.name)}
              >
                {g.name[0]?.toUpperCase()}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="vc-server-rail__spacer" />

      <div className="vc-server-rail__footer">
        <WebUserRailPanel
          username={username}
          presence={ownPresence}
          onPresenceChange={onPresenceChange}
          onOpenSettings={onOpenSettings}
          disabled={presenceDisabled}
        />
      </div>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg className="vc-server-rail__svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z" />
    </svg>
  );
}
