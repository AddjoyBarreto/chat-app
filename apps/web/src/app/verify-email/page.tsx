"use client";

import { verifyEmailOnServer } from "@/lib/client-api";
import { friendlyError } from "@/lib/errors";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email…");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Missing verification token.");
      return;
    }

    void verifyEmailOnServer(token)
      .then(() => {
        setStatus("success");
        setMessage("Your email is verified. You can sign in to VaultChat.");
      })
      .catch((e) => {
        setStatus("error");
        setMessage(friendlyError(e));
      });
  }, [token]);

  return (
    <div className="vc-app">
      <div className="vc-register">
        <div className="vc-register__logo" aria-hidden>
          {status === "success" ? "✅" : status === "error" ? "⚠️" : "✉️"}
        </div>
        <h1 className="vc-register__title">Email verification</h1>
        <p className="vc-register__subtitle">{message}</p>
        {status !== "loading" && (
          <Link href="/chat" className="vc-btn" style={{ display: "inline-block", textDecoration: "none" }}>
            Go to VaultChat
          </Link>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="vc-app">
          <div className="vc-register">
            <p className="vc-register__subtitle">Loading…</p>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
