import { createCommunityChannel, friendlyError } from "@vaultchat/client";
import type { ChannelInfo, ChannelType } from "@vaultchat/protocol";
import { useState } from "react";
import { IconClose } from "./CommunityIcons.js";
import { OverlayPortal } from "./OverlayPortal.js";

export function CreateChannelModal({
  token,
  communityId,
  categoryId,
  channelType,
  onClose,
  onCreated,
}: {
  token: string;
  communityId: string;
  categoryId?: string;
  channelType: ChannelType;
  onClose: () => void;
  onCreated: (channel: ChannelInfo) => void;
}) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = channelType === "voice" ? "Voice channel" : "Text channel";

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const channel = await createCommunityChannel(token, communityId, {
        name: name.trim(),
        type: channelType,
        categoryId,
        topic: topic.trim() || undefined,
        isPrivate,
      });
      onCreated(channel);
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <OverlayPortal>
      <div className="vc-community-settings-overlay" role="dialog" aria-modal aria-label={`Create ${label}`}>
        <div className="vc-community-settings vc-community-settings--compact">
          <header className="vc-community-settings__header">
            <h2>Create {label}</h2>
            <button type="button" className="vc-community-settings__close" onClick={onClose} aria-label="Close">
              <IconClose size={18} />
            </button>
          </header>

          <div className="vc-community-settings__body">
            {error && (
              <div className="vc-banner vc-banner--warning" role="alert">
                {error}
              </div>
            )}

            <label className="vc-community-settings__field">
              <span>Channel name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                placeholder={channelType === "voice" ? "voice-chat" : "new-channel"}
                maxLength={32}
                autoFocus
              />
            </label>
            <p className="vc-community-settings__hint">
              Lowercase letters, numbers, hyphens, and underscores only.
            </p>

            {channelType === "text" && (
              <label className="vc-community-settings__field">
                <span>Topic (optional)</span>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="What is this channel about?"
                />
              </label>
            )}

            <label className="vc-channel-settings__toggle">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              <span>
                <strong>Private channel</strong>
                <small>Only selected members can view and interact</small>
              </span>
            </label>

            <div className="vc-channel-settings__actions">
              <button type="button" className="vc-btn vc-btn--secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="vc-btn vc-btn--primary"
                onClick={() => void handleCreate()}
                disabled={creating || name.trim().length < 2}
              >
                {creating ? "Creating…" : "Create channel"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
