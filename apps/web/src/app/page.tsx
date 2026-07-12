import Link from "next/link";
import { LandingShell } from "@/components/landing/LandingShell";
import { getDownloadsManifest } from "@/lib/downloads";

const WIZZWORLD_URL = "https://wizzworld.com/";

export default async function HomePage() {
  const downloads = await getDownloadsManifest();

  return (
    <LandingShell active="home">
      <section className="vl-hero" aria-label="Hero">
        <div className="vl-hero__atmosphere" aria-hidden>
          <div className="vl-hero__grid" />
          <div className="vl-hero__orb vl-hero__orb--a" />
          <div className="vl-hero__orb vl-hero__orb--b" />
          <div className="vl-hero__orb vl-hero__orb--c" />
          <div className="vl-hero__ring" />
          <div className="vl-hero__scan" />
          <div className="vl-hero__particles">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>

        <p className="vl-hero__live">
          <span className="vl-hero__pulse" aria-hidden />
          Encrypted channel online
        </p>

        <h1 className="vl-hero__brand">
          Vault<em>Chat</em>
        </h1>
        <p className="vl-hero__headline">Private signal. Your keys never leave your devices.</p>
        <p className="vl-hero__sub">
          End-to-end encrypted messaging for web and desktop. The server relays ciphertext — it
          cannot read your messages.
        </p>
        <div className="vl-hero__cta">
          <Link href="/chat" className="vl-btn vl-btn--primary">
            Create account
          </Link>
          <Link href="/download" className="vl-btn vl-btn--ghost">
            Download apps
          </Link>
        </div>
        <p className="vl-hero__madeby">
          A product by{" "}
          <a href={WIZZWORLD_URL} target="_blank" rel="noopener noreferrer">
            WizzWorld
          </a>
        </p>
      </section>

      <section className="vl-section vl-section--alive" aria-labelledby="vl-encrypt-title">
        <p className="vl-section__eyebrow">Encryption</p>
        <h2 id="vl-encrypt-title" className="vl-section__title">
          Built so silence stays silent
        </h2>
        <p className="vl-section__body">
          Keys are generated on your device. Messages stay encrypted in transit and at rest on our
          relays. Open the web app to register, or install the native desktop client.
        </p>
      </section>

      <section className="vl-section vl-section--alive" aria-labelledby="vl-apps-title">
        <p className="vl-section__eyebrow">Desktop</p>
        <h2 id="vl-apps-title" className="vl-section__title">
          Native apps for Mac and Windows
        </h2>
        <p className="vl-section__body">
          Same encrypted vault, in a focused desktop window. Grab a build below or visit the full
          download page.
        </p>

        <div className="vl-download-strip">
          <article className="vl-platform">
            <div className="vl-platform__meta">
              <h3 className="vl-platform__name">{downloads.mac.label}</h3>
              <span className="vl-platform__file">{downloads.mac.filename}</span>
            </div>
            {downloads.mac.available ? (
              <a className="vl-btn vl-btn--primary" href={downloads.mac.href} download>
                Download for Mac
              </a>
            ) : (
              <span className="vl-btn vl-btn--disabled">Coming soon</span>
            )}
          </article>
          <article className="vl-platform">
            <div className="vl-platform__meta">
              <h3 className="vl-platform__name">{downloads.windows.label}</h3>
              <span className="vl-platform__file">{downloads.windows.filename}</span>
            </div>
            {downloads.windows.available ? (
              <a className="vl-btn vl-btn--primary" href={downloads.windows.href} download>
                Download for Windows
              </a>
            ) : (
              <span className="vl-btn vl-btn--disabled">Coming soon</span>
            )}
          </article>
        </div>

        <aside className="vl-note" role="note">
          <p className="vl-note__title">Safe to download</p>
          <p className="vl-note__body">{downloads.note}</p>
        </aside>
      </section>

      <section className="vl-section vl-section--maker" aria-labelledby="vl-maker-title">
        <p className="vl-section__eyebrow">Studio</p>
        <h2 id="vl-maker-title" className="vl-section__title">
          Created by WizzWorld
        </h2>
        <p className="vl-section__body">
          VaultChat is designed and built by{" "}
          <a href={WIZZWORLD_URL} target="_blank" rel="noopener noreferrer" className="vl-inline-link">
            WizzWorld
          </a>{" "}
          — crafting modern, tech-forward products that unlock potential for people and brands.
        </p>
        <a
          href={WIZZWORLD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="vl-btn vl-btn--ghost vl-btn--maker"
        >
          Visit wizzworld.com
        </a>
      </section>
    </LandingShell>
  );
}
