import type { useFriends } from "@vaultchat/chat-react";
import { PresenceDot } from "@vaultchat/chat-react";
import { friendlyError, presenceLabel, searchUsers } from "@vaultchat/client";
import type { UserSearchResult } from "@vaultchat/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

type Friends = ReturnType<typeof useFriends>;
type FriendsTab = "online" | "all" | "pending" | "add";

function relationshipLabel(r: UserSearchResult["relationship"]): string | null {
  switch (r) {
    case "friend":
      return "Friends";
    case "pending_out":
      return "Request sent";
    case "pending_in":
      return "Wants to add you";
    default:
      return null;
  }
}

export function FriendsPanel({
  authToken,
  friends,
  onMessage,
}: {
  authToken: string;
  friends: Friends;
  onMessage: (userId: string, username: string) => void;
}) {
  const [tab, setTab] = useState<FriendsTab>("all");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebouncedValue(username.trim().toLowerCase(), 300);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);
    setSearchError(null);

    void searchUsers(authToken, debouncedQuery, 8, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setResults(res.users);
        setDropdownOpen(true);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        setResults([]);
        setSearchError(friendlyError(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });

    return () => controller.abort();
  }, [authToken, debouncedQuery]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleAdd = useCallback(
    async (targetUsername: string) => {
      setLoading(true);
      setFormError(null);
      try {
        await friends.addFriend(targetUsername);
        setUsername("");
        setResults([]);
        setDropdownOpen(false);
        setTab("all");
      } catch (e) {
        setFormError(friendlyError(e));
      } finally {
        setLoading(false);
      }
    },
    [friends]
  );

  const showDropdown = dropdownOpen && debouncedQuery.length >= 2;
  const isActivePresence = (userId: string) => {
    const status = friends.getPresence(userId);
    return status === "online" || status === "idle" || status === "busy";
  };
  const onlineFriends = friends.friends.filter((f) => isActivePresence(f.userId));

  return (
    <div className="dc-hub">
      <header className="dc-hub__header">
        <span className="dc-hub__header-icon" aria-hidden>
          <FriendsIcon />
        </span>
        <h1 className="dc-hub__title">Friends</h1>
        <div className="dc-hub__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`dc-hub__tab${tab === "online" ? " dc-hub__tab--active" : ""}`}
            onClick={() => setTab("online")}
          >
            Online
          </button>
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
            className={`dc-hub__tab${tab === "pending" ? " dc-hub__tab--active" : ""}`}
            onClick={() => setTab("pending")}
          >
            Pending
            {friends.incoming.length > 0 && (
              <span className="dc-hub__tab-badge">{friends.incoming.length}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            className={`dc-hub__tab dc-hub__tab--action${tab === "add" ? " dc-hub__tab--active" : ""}`}
            onClick={() => setTab("add")}
          >
            Add Friend
          </button>
        </div>
      </header>

      <div className="dc-hub__body">
        {formError && (
          <p className="dc-hub__error" role="alert">
            {formError}
          </p>
        )}

        {tab === "online" && (
          <section className="dc-hub__section">
            {onlineFriends.length === 0 ? (
              <div className="dc-hub__empty-state">
                <div className="dc-hub__empty-icon">
                  <FriendsIcon />
                </div>
                <h2>There are no friends online at this time.</h2>
                <p>Check back later, or message a friend from the All tab.</p>
              </div>
            ) : (
              <>
                <h2 className="dc-hub__section-title">
                  Online — {onlineFriends.length}
                </h2>
                <ul className="dc-hub__user-list">
                  {onlineFriends.map((f) => (
                    <li key={f.userId}>
                      <button
                        type="button"
                        className="dc-hub__user-row"
                        onClick={() => onMessage(f.userId, f.username)}
                      >
                        <span className="dc-hub__avatar-wrap">
                          <span className="dc-hub__avatar">{f.username[0]}</span>
                          <PresenceDot
                            status={friends.getPresence(f.userId)}
                            className="dc-hub__avatar-dot"
                          />
                        </span>
                        <span className="dc-hub__user-info">
                          <span className="dc-hub__user-name">{f.username}</span>
                          <span className="dc-hub__user-sub">
                            {presenceLabel(friends.getPresence(f.userId))}
                          </span>
                        </span>
                        <span className="dc-hub__row-action">Message</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {tab === "all" && (
          <section className="dc-hub__section">
            <h2 className="dc-hub__section-title">
              All friends — {friends.friends.length}
            </h2>
            {friends.loading ? (
              <p className="dc-hub__empty">Loading…</p>
            ) : friends.friends.length === 0 ? (
              <div className="dc-hub__empty-state dc-hub__empty-state--compact">
                <p>No friends yet. Use Add Friend to find people.</p>
              </div>
            ) : (
              <ul className="dc-hub__user-list">
                {friends.friends.map((f) => (
                  <li key={f.userId}>
                    <button
                      type="button"
                      className="dc-hub__user-row"
                      onClick={() => onMessage(f.userId, f.username)}
                    >
                      <span className="dc-hub__avatar-wrap">
                        <span className="dc-hub__avatar">{f.username[0]}</span>
                        <PresenceDot
                          status={friends.getPresence(f.userId)}
                          className="dc-hub__avatar-dot"
                        />
                      </span>
                      <span className="dc-hub__user-info">
                        <span className="dc-hub__user-name">{f.username}</span>
                        <span className="dc-hub__user-sub">
                          {presenceLabel(friends.getPresence(f.userId))}
                        </span>
                      </span>
                      <span className="dc-hub__row-action">Message</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "pending" && (
          <section className="dc-hub__section">
            <h2 className="dc-hub__section-title">
              Pending — {friends.incoming.length}
            </h2>
            {friends.incoming.length === 0 ? (
              <div className="dc-hub__empty-state dc-hub__empty-state--compact">
                <p>No pending friend requests.</p>
              </div>
            ) : (
              <ul className="dc-hub__user-list">
                {friends.incoming.map((r) => (
                  <li key={r.id} className="dc-hub__request-row">
                    <span className="dc-hub__avatar">{r.senderUsername[0]}</span>
                    <span className="dc-hub__user-info">
                      <span className="dc-hub__user-name">{r.senderUsername}</span>
                      <span className="dc-hub__user-sub">Incoming friend request</span>
                    </span>
                    <div className="dc-hub__request-actions">
                      <button
                        type="button"
                        className="dc-hub__accept-btn"
                        onClick={() => void friends.accept(r.id)}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="dc-hub__reject-btn"
                        onClick={() => void friends.reject(r.id)}
                      >
                        Ignore
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "add" && (
          <section className="dc-hub__section dc-hub__form">
            <h2 className="dc-hub__section-title">Add friend</h2>
            <p className="dc-hub__hint">You can add friends by searching their username.</p>
            <div className="dc-user-search" ref={searchRef}>
              <div className="dc-user-search__field">
                <input
                  className="dc-hub__input dc-user-search__input"
                  placeholder="Search by username…"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setDropdownOpen(true);
                    setFormError(null);
                  }}
                  onFocus={() => debouncedQuery.length >= 2 && setDropdownOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && results[0]?.relationship === "none") {
                      void handleAdd(results[0].username);
                    }
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={loading}
                />
                {searching && <span className="dc-user-search__spinner" aria-hidden />}
              </div>

              {debouncedQuery.length > 0 && debouncedQuery.length < 2 && (
                <p className="dc-user-search__hint">Type at least 2 characters to search</p>
              )}

              {showDropdown && (
                <ul className="dc-user-search__dropdown" role="listbox">
                  {searchError && <li className="dc-user-search__empty">{searchError}</li>}
                  {!searchError && searching && (
                    <li className="dc-user-search__empty">Searching…</li>
                  )}
                  {!searchError && !searching && results.length === 0 && (
                    <li className="dc-user-search__empty">No users found</li>
                  )}
                  {results.map((user) => {
                    const badge = relationshipLabel(user.relationship);
                    const canAdd = user.relationship === "none";
                    return (
                      <li key={user.id}>
                        <button
                          type="button"
                          className="dc-user-search__item"
                          disabled={!canAdd && user.relationship !== "friend"}
                          onClick={() => {
                            if (user.relationship === "friend") {
                              onMessage(user.id, user.username);
                              setDropdownOpen(false);
                            } else if (canAdd) {
                              void handleAdd(user.username);
                            }
                          }}
                        >
                          <span className="dc-user-search__avatar">{user.username[0]}</span>
                          <span className="dc-user-search__name">@{user.username}</span>
                          {badge ? (
                            <span className="dc-user-search__badge">{badge}</span>
                          ) : (
                            <span className="dc-user-search__action">Add</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function FriendsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  );
}
