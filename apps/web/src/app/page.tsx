export default function HomePage() {
  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>VaultChat</h1>
      <p style={{ color: "#8696a0", lineHeight: 1.5 }}>
        End-to-end encrypted messaging. The server relays ciphertext only — it cannot read your
        messages.
      </p>
      <section style={{ marginTop: "2rem", padding: "1rem", background: "#111b21", borderRadius: 8 }}>
        <h2 style={{ fontSize: "0.875rem", color: "#8696a0", margin: "0 0 0.5rem" }}>API</h2>
        <ul style={{ margin: 0, paddingLeft: "1.25rem", lineHeight: 1.8, fontSize: "0.875rem" }}>
          <li>
            <code>GET /api/v1/health</code>
          </li>
          <li>
            <code>POST /api/v1/users/register</code>
          </li>
          <li>
            <code>GET /api/v1/users/:username</code>
          </li>
          <li>
            <code>POST /api/v1/keys</code>
          </li>
          <li>
            <code>GET /api/v1/keys/:userId</code>
          </li>
          <li>
            <code>POST /api/v1/messages</code>
          </li>
          <li>
            <code>GET /api/v1/messages</code>
          </li>
        </ul>
      </section>
      <a
        href="/chat"
        style={{
          display: "inline-block",
          marginTop: "1.5rem",
          padding: "10px 20px",
          background: "#00a884",
          color: "#111b21",
          borderRadius: 8,
          textDecoration: "none",
          fontWeight: 600,
          fontSize: "0.875rem",
        }}
      >
        Open Chat →
      </a>
      <p style={{ marginTop: "1rem", fontSize: "0.75rem", color: "#667781" }}>
        Phase 1 — Web chat with E2EE. Gateway on port 3001.
      </p>
    </main>
  );
}
