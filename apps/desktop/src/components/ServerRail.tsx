type Nav = "home" | "friends";

export function ServerRail({
  nav,
  onNav,
  username,
  unread,
  friendsUnread,
  onOpenSettings,
}: {
  nav: Nav;
  onNav: (n: Nav) => void;
  username: string;
  unread: number;
  friendsUnread: number;
  onOpenSettings: () => void;
}) {
  return (
    <nav className="dc-rail" aria-label="App navigation">
      <button
        type="button"
        className={`dc-rail__btn dc-rail__btn--home${nav === "home" ? " dc-rail__btn--active" : ""}`}
        onClick={() => onNav("home")}
        title="Direct Messages"
      >
        <span className="dc-rail__icon">💬</span>
        {unread > 0 && <span className="dc-rail__badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      <button
        type="button"
        className={`dc-rail__btn${nav === "friends" ? " dc-rail__btn--active" : ""}`}
        onClick={() => onNav("friends")}
        title="Friends"
      >
        <span className="dc-rail__icon">👥</span>
        {friendsUnread > 0 && (
          <span className="dc-rail__badge">{friendsUnread > 9 ? "9+" : friendsUnread}</span>
        )}
      </button>

      <div className="dc-rail__spacer" />

      <button
        type="button"
        className="dc-rail__avatar"
        title={`@${username} — Settings`}
        onClick={onOpenSettings}
      >
        {username[0]?.toUpperCase()}
      </button>
    </nav>
  );
}
