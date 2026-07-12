import Link from "next/link";
import type { ReactNode } from "react";
import "@/app/landing.css";

const WIZZWORLD_URL = "https://wizzworld.com/";

export function LandingShell({
  children,
  active,
}: {
  children: ReactNode;
  active?: "home" | "download";
}) {
  return (
    <div className="vl-root">
      <header className="vl-nav">
        <Link href="/" className="vl-nav__brand">
          Vault<span>Chat</span>
        </Link>
        <nav className="vl-nav__links" aria-label="Primary">
          <Link href="/" aria-current={active === "home" ? "page" : undefined}>
            Home
          </Link>
          <Link href="/download" aria-current={active === "download" ? "page" : undefined}>
            Download
          </Link>
          <Link href="/chat">Open chat</Link>
        </nav>
      </header>
      {children}
      <footer className="vl-footer">
        <span>VaultChat — ciphertext only on the wire</span>
        <span className="vl-footer__credit">
          Created by{" "}
          <a href={WIZZWORLD_URL} target="_blank" rel="noopener noreferrer">
            WizzWorld
          </a>
        </span>
      </footer>
    </div>
  );
}
