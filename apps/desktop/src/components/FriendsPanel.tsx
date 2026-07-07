import type { useFriends } from "@vaultchat/chat-react";
import { friendlyError, searchUsers } from "@vaultchat/client";
import type { UserSearchResult } from "@vaultchat/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

type Friends = ReturnType<typeof useFriends>;

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
      } catch (e) {
        setFormError(friendlyError(e));
      } finally {
        setLoading(false);
      }
    },
    [friends]
  );

  const showDropdown = dropdownOpen && debouncedQuery.length >= 2;

  return (
    <div className="dc-friends-main">
      <header className="dc-friends-main__header">
        <h2>Friends</h2>
      </header>

      <div className="dc-friends-main__body">
        {formError && (
          <p className="dc-friends-main__error" role="alert">
            {formError}
          </p>
        )}

        <section className="dc-friends-main__section">
          <h3 className="dc-friends-main__title">Add friend</h3>
          <div className="dc-user-search" ref={searchRef}>
            <div className="dc-user-search__field">
              <input
                className="dc-user-search__input"
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

        {friends.incoming.length > 0 && (
          <section className="dc-friends-main__section">
            <h3 className="dc-friends-main__title">Pending — {friends.incoming.length}</h3>
            <ul className="dc-friends-main__pending">
              {friends.incoming.map((r) => (
                <li key={r.id} className="dc-friend-request">
                  <span className="dc-dm-item__avatar">{r.senderUsername[0]}</span>
                  <span className="dc-friend-request__name">@{r.senderUsername}</span>
                  <button
                    type="button"
                    className="dc-friend-request__accept"
                    onClick={() => void friends.accept(r.id)}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="dc-friend-request__reject"
                    onClick={() => void friends.reject(r.id)}
                  >
                    Decline
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="dc-friends-main__section">
          <h3 className="dc-friends-main__title">All friends — {friends.friends.length}</h3>
          {friends.loading ? (
            <p className="dc-friends-main__empty">Loading…</p>
          ) : friends.friends.length === 0 ? (
            <p className="dc-friends-main__empty">
              No friends yet. Search for someone by username above.
            </p>
          ) : (
            <ul className="dc-friends-main__list">
              {friends.friends.map((f) => (
                <li key={f.userId}>
                  <button
                    type="button"
                    className="dc-friends-main__friend"
                    onClick={() => onMessage(f.userId, f.username)}
                  >
                    <span className="dc-dm-item__avatar">{f.username[0]}</span>
                    <span className="dc-friends-main__friend-info">
                      <span className="dc-friends-main__friend-name">@{f.username}</span>
                      <span className="dc-friends-main__friend-hint">Click to message</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
