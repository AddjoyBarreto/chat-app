"use client";

import { downloadEncryptedMedia } from "@vaultchat/client";
import type { MessageContent } from "@vaultchat/protocol";
import { useEffect, useState } from "react";

interface MediaAttachmentProps {
  token: string;
  media: NonNullable<MessageContent["media"]>;
}

export function MediaAttachment({ token, media }: MediaAttachmentProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const bytes = await downloadEncryptedMedia(token, media);
        const blob = new Blob([bytes], { type: media.mime });
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setUrl(objectUrl);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token, media.mediaId, media.mime, media.key, media.nonce]);

  if (loading) {
    return <span className="vc-media-loading">Loading encrypted media…</span>;
  }
  if (error || !url) {
    return <span>🔒 Unable to load media</span>;
  }

  if (media.mime.startsWith("video/")) {
    return (
      <video src={url} controls playsInline className="vc-bubble__video" preload="metadata" />
    );
  }

  return <img src={url} alt="Encrypted attachment" className="vc-bubble__image" />;
}
