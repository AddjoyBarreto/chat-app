export function WelcomePanel({ username }: { username: string }) {
  return (
    <div className="dc-welcome">
      <div className="dc-welcome__art" aria-hidden>
        <div className="dc-welcome__bubble dc-welcome__bubble--1" />
        <div className="dc-welcome__bubble dc-welcome__bubble--2" />
        <div className="dc-welcome__bubble dc-welcome__bubble--3" />
      </div>
      <h2>Welcome to VaultChat, @{username}</h2>
      <p>Select a direct message from the sidebar, or search for a username to start chatting.</p>
      <p className="dc-muted">🔒 All messages are end-to-end encrypted on your device.</p>
    </div>
  );
}
