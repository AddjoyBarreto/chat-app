"use client";

import type { ChannelCategoryInfo, ChannelInfo } from "@vaultchat/protocol";

interface CommunitySidebarProps {
  communityName: string;
  categories: ChannelCategoryInfo[];
  channels: ChannelInfo[];
  activeChannelId?: string;
  onSelectChannel: (channel: ChannelInfo) => void;
  onBack: () => void;
}

export function CommunitySidebar({
  communityName,
  categories,
  channels,
  activeChannelId,
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
    const icon = ch.type === "voice" ? "🔊" : ch.type === "announcement" ? "📢" : "#";
    return (
      <button
        key={ch.id}
        type="button"
        className={`vc-channel-item${activeChannelId === ch.id ? " vc-channel-item--active" : ""}`}
        onClick={() => onSelectChannel(ch)}
      >
        <span className="vc-channel-item__icon">{icon}</span>
        <span>{ch.name}</span>
      </button>
    );
  }

  return (
    <aside className="vc-community-sidebar">
      <button type="button" className="vc-header__back" onClick={onBack}>
        ‹ Communities
      </button>
      <h2 className="vc-community-sidebar__title">{communityName}</h2>

      {categories.map((cat) => (
        <div key={cat.id} className="vc-channel-category">
          <div className="vc-channel-category__name">{cat.name.toUpperCase()}</div>
          {(byCategory.get(cat.id) ?? []).map(renderChannel)}
        </div>
      ))}

      {uncategorized.length > 0 && (
        <div className="vc-channel-category">
          <div className="vc-channel-category__name">CHANNELS</div>
          {uncategorized.map(renderChannel)}
        </div>
      )}
    </aside>
  );
}
