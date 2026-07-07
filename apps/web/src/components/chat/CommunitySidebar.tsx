"use client";

import type { ChannelCategoryInfo, ChannelInfo, ChannelType } from "@vaultchat/protocol";

interface CommunitySidebarProps {
  communityName: string;
  categories: ChannelCategoryInfo[];
  channels: ChannelInfo[];
  activeChannelId?: string;
  isAdmin?: boolean;
  onOpenSettings?: () => void;
  onCreateChannel?: (categoryId: string, type: ChannelType) => void;
  onChannelSettings?: (channel: ChannelInfo) => void;
  onSelectChannel: (channel: ChannelInfo) => void;
  onBack: () => void;
}

function categoryChannelType(cat: ChannelCategoryInfo): ChannelType {
  return cat.name.toLowerCase().includes("voice") ? "voice" : "text";
}

export function CommunitySidebar({
  communityName,
  categories,
  channels,
  activeChannelId,
  isAdmin,
  onOpenSettings,
  onCreateChannel,
  onChannelSettings,
  onSelectChannel,
  onBack,
}: CommunitySidebarProps) {
  const uncategorized = channels.filter((c) => !c.categoryId);
  const byCategory = new Map<string, ChannelInfo[]>();
  for (const ch of channels) {
    if (!ch.categoryId) continue;
    const list = byCategory.get(ch.categoryId) ?? [];
    list.push(ch);
    byCategory.set(ch.categoryId, list);
  }

  function renderChannel(ch: ChannelInfo) {
    const icon = ch.type === "voice" ? "🔊" : "#";
    return (
      <div key={ch.id} className="vc-channel-item-wrap">
        <button
          type="button"
          className={`vc-channel-item${activeChannelId === ch.id ? " vc-channel-item--active" : ""}`}
          onClick={() => onSelectChannel(ch)}
        >
          <span className="vc-channel-item__icon">{icon}</span>
          <span className="vc-channel-item__name">{ch.name}</span>
          {ch.isPrivate && (
            <span className="vc-channel-item__lock" title="Private channel" aria-label="Private channel">
              🔒
            </span>
          )}
        </button>
        {isAdmin && onChannelSettings && (
          <button
            type="button"
            className="vc-channel-item__settings"
            onClick={() => onChannelSettings(ch)}
            title="Channel settings"
            aria-label={`Settings for ${ch.name}`}
          >
            ⚙
          </button>
        )}
      </div>
    );
  }

  return (
    <aside className="vc-community-sidebar">
      <div className="vc-community-sidebar__top">
        <button type="button" className="vc-community-sidebar__back" onClick={onBack}>
          ‹ Communities
        </button>
        <div className="vc-community-sidebar__title-row">
          <h2 className="vc-community-sidebar__title">{communityName}</h2>
          {isAdmin && onOpenSettings && (
            <button
              type="button"
              className="vc-community-sidebar__settings"
              onClick={onOpenSettings}
              title="Server settings"
              aria-label="Open server settings"
            >
              ⚙
            </button>
          )}
        </div>
      </div>

      {categories.map((cat) => (
        <div key={cat.id} className="vc-channel-category">
          <div className="vc-channel-category__header">
            <div className="vc-channel-category__name">{cat.name.toUpperCase()}</div>
            {isAdmin && onCreateChannel && (
              <button
                type="button"
                className="vc-channel-category__add"
                onClick={() => onCreateChannel(cat.id, categoryChannelType(cat))}
                title={`Create ${categoryChannelType(cat)} channel`}
                aria-label={`Create ${categoryChannelType(cat)} channel`}
              >
                +
              </button>
            )}
          </div>
          {(byCategory.get(cat.id) ?? []).map(renderChannel)}
        </div>
      ))}

      {uncategorized.length > 0 && (
        <div className="vc-channel-category">
          <div className="vc-channel-category__header">
            <div className="vc-channel-category__name">CHANNELS</div>
            {isAdmin && onCreateChannel && (
              <button
                type="button"
                className="vc-channel-category__add"
                onClick={() => onCreateChannel("", "text")}
                title="Create text channel"
                aria-label="Create text channel"
              >
                +
              </button>
            )}
          </div>
          {uncategorized.map(renderChannel)}
        </div>
      )}
    </aside>
  );
}
