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
          <p className="vl-note__title">About installer warnings</p>
          <p className="vl-note__body">
            These files are safe to download from this site. macOS may say the app is
            &ldquo;damaged&rdquo; — that is Gatekeeper rejecting an unsigned build, not a corrupt
            file. After installing, clear the quarantine flag in Terminal:
            <code style={{ display: "block", marginTop: "0.75rem", fontSize: "0.9em" }}>
              xattr -cr /Applications/VaultChat.app
            </code>
            Then open VaultChat again. Windows may show a SmartScreen warning for the same reason.
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
