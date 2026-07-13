import type { Metadata } from "next";
import Link from "next/link";
import { LandingShell } from "@/components/landing/LandingShell";
import { getDownloadsManifest } from "@/lib/downloads";

export const metadata: Metadata = {
  title: "Download VaultChat",
  description: "Download VaultChat for macOS and Windows",
};

export default async function DownloadPage() {
  const downloads = await getDownloadsManifest();

  return (
    <LandingShell active="download">
      <div className="vl-page-head">
        <p className="vl-version">
          Release {downloads.version} · updated {downloads.updatedAt}
        </p>
        <h1>Download VaultChat</h1>
        <p>
          Install the desktop client for your platform. Prefer the browser?{" "}
          <Link href="/chat" style={{ color: "var(--vl-teal)", textDecoration: "underline" }}>
            Create a web account
          </Link>{" "}
          instead.
        </p>
      </div>

      <section className="vl-section" style={{ borderTop: "none", paddingTop: "2rem" }}>
        <div className="vl-download-strip">
          <article className="vl-platform">
            <div className="vl-platform__meta">
              <h2 className="vl-platform__name">{downloads.mac.label}</h2>
              <span className="vl-platform__file">{downloads.mac.filename}</span>
            </div>
            <p className="vl-section__body" style={{ margin: 0 }}>
              Apple Silicon and Intel Macs via DMG installer.
            </p>
            {downloads.mac.available ? (
              <a className="vl-btn vl-btn--primary" href={downloads.mac.href} download>
                Download .dmg
              </a>
            ) : (
              <span className="vl-btn vl-btn--disabled">File not uploaded yet</span>
            )}
          </article>

          <article className="vl-platform">
            <div className="vl-platform__meta">
              <h2 className="vl-platform__name">{downloads.windows.label}</h2>
              <span className="vl-platform__file">{downloads.windows.filename}</span>
            </div>
            <p className="vl-section__body" style={{ margin: 0 }}>
              Windows 10/11 NSIS installer.
            </p>
            {downloads.windows.available ? (
              <a className="vl-btn vl-btn--primary" href={downloads.windows.href} download>
                Download .exe
              </a>
            ) : (
              <span className="vl-btn vl-btn--disabled">File not uploaded yet</span>
            )}
          </article>
        </div>

        <aside className="vl-note" role="note">
          <p className="vl-note__title">macOS: &ldquo;damaged&rdquo; or won&apos;t open?</p>
          <p className="vl-note__body">
            The DMG is unsigned, so Gatekeeper may block it — the file is not corrupt. After you
            drag VaultChat into <strong>Applications</strong>, open <strong>Terminal</strong> and
            run:
          </p>
          <code style={{ display: "block", marginTop: "0.5rem", fontSize: "0.9em" }}>
            xattr -d com.apple.quarantine /Applications/VaultChat.app
          </code>
          <p className="vl-note__body" style={{ marginTop: "0.75rem" }}>
            Then open VaultChat from Applications again. If the <strong>.dmg</strong> itself
            won&apos;t open, remove quarantine from the download first (adjust the path if needed):
          </p>
          <code style={{ display: "block", marginTop: "0.5rem", fontSize: "0.9em" }}>
            xattr -d com.apple.quarantine ~/Downloads/VaultChat.dmg
          </code>
          <p className="vl-note__body" style={{ marginTop: "0.75rem" }}>
            Still blocked? Try clearing all extended attributes on the app:{" "}
            <code>xattr -cr /Applications/VaultChat.app</code>. Windows may show a similar
            SmartScreen warning — choose &ldquo;Run anyway&rdquo; if you trust this download.
          </p>
        </aside>

        <p className="vl-section__body" style={{ marginTop: "2rem" }}>
          After installing, open VaultChat and create an account — the same credentials work on the
          web app at{" "}
          <Link href="/chat" style={{ color: "var(--vl-cyan)" }}>
            /chat
          </Link>
          . VaultChat is created by{" "}
          <a
            href="https://wizzworld.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="vl-inline-link"
          >
            WizzWorld
          </a>
          .
        </p>
      </section>
    </LandingShell>
  );
}
