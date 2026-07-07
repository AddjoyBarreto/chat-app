"use client";

import type { ChannelCategoryInfo, ChannelInfo, ChannelType } from "@vaultchat/protocol";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface CommunityChannelSidebarProps {
  communityName: string;
  categories: ChannelCategoryInfo[];
  channels: ChannelInfo[];
  activeChannelId?: string;
  isAdmin?: boolean;
  onBack: () => void;
  backLabel?: string;
  onOpenServerSettings?: (tab?: "overview" | "members" | "invites") => void;
  onCreateCategory?: () => void;
  onCreateChannel?: (categoryId: string | undefined, type: ChannelType) => void;
  onChannelSettings?: (channel: ChannelInfo) => void;
  onChannelDelete?: (channel: ChannelInfo) => void;
  onSelectChannel: (channel: ChannelInfo) => void;
}

function categoryChannelType(cat: ChannelCategoryInfo): ChannelType {
  return cat.name.toLowerCase().includes("voice") ? "voice" : "text";
}

interface ContextMenuState {
  x: number;
  y: number;
  channel: ChannelInfo;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
}

export function CommunityChannelSidebar({
  communityName,
  categories,
  channels,
  activeChannelId,
  isAdmin,
  onBack,
  onOpenServerSettings,
  onCreateCategory,
  onCreateChannel,
  onChannelSettings,
  onChannelDelete,
  onSelectChannel,
  backLabel = "‹ Communities",
}: CommunityChannelSidebarProps) {
  const [serverMenuOpen, setServerMenuOpen] = useState(false);
  const [serverMenuPos, setServerMenuPos] = useState<MenuPosition | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const serverHeaderBtnRef = useRef<HTMLButtonElement>(null);
  const serverMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const uncategorized = channels.filter((c) => !c.categoryId);
  const byCategory = new Map<string, ChannelInfo[]>();
  for (const ch of channels) {
    if (!ch.categoryId) continue;
    const list = byCategory.get(ch.categoryId) ?? [];
    list.push(ch);
    byCategory.set(ch.categoryId, list);
  }

  const closeMenus = useCallback(() => {
    setServerMenuOpen(false);
    setServerMenuPos(null);
    setContextMenu(null);
  }, []);

  const updateServerMenuPosition = useCallback(() => {
    const rect = serverHeaderBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setServerMenuPos({
      top: rect.bottom + 6,
      left: rect.left + 8,
      width: Math.max(rect.width - 16, 200),
    });
  }, []);

  function toggleServerMenu() {
    if (serverMenuOpen) {
      closeMenus();
      return;
    }
    updateServerMenuPosition();
    setServerMenuOpen(true);
    setContextMenu(null);
  }

  useLayoutEffect(() => {
    if (!serverMenuOpen) return;
    updateServerMenuPosition();
    window.addEventListener("resize", updateServerMenuPosition);
    window.addEventListener("scroll", updateServerMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateServerMenuPosition);
      window.removeEventListener("scroll", updateServerMenuPosition, true);
    };
  }, [serverMenuOpen, updateServerMenuPosition]);

  useEffect(() => {
    if (!serverMenuOpen && !contextMenu) return;
    function onPointerDown(e: MouseEvent) {
      if (serverHeaderBtnRef.current?.contains(e.target as Node)) return;
      if (serverMenuRef.current?.contains(e.target as Node)) return;
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      closeMenus();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenus();
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [serverMenuOpen, contextMenu, closeMenus]);

  function toggleCategory(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function openContextMenu(e: React.MouseEvent, channel: ChannelInfo) {
    e.preventDefault();
    e.stopPropagation();
    setServerMenuOpen(false);
    setContextMenu({ x: e.clientX, y: e.clientY, channel });
  }

  function firstTextCategoryId(): string | undefined {
    const textCat = categories.find((c) => categoryChannelType(c) === "text");
    return textCat?.id;
  }

  function renderChannel(ch: ChannelInfo) {
    const active = activeChannelId === ch.id;

    return (
      <div
        key={ch.id}
        className={`vc-channel-item-wrap${active ? " vc-channel-item-wrap--active" : ""}`}
        onContextMenu={(e) => openContextMenu(e, ch)}
      >
        <button
          type="button"
          className={`vc-channel-item${active ? " vc-channel-item--active" : ""}`}
          onClick={() => onSelectChannel(ch)}
        >
          <span
            className={`vc-channel-item__icon${ch.type === "voice" ? " vc-channel-item__icon--voice" : ""}`}
            aria-hidden
          />
          <span className="vc-channel-item__name">{ch.name}</span>
          {ch.isPrivate && (
            <span className="vc-channel-item__lock" title="Private channel" aria-label="Private channel">
              🔒
            </span>
          )}
        </button>
        {isAdmin && onChannelSettings && (
          <div className="vc-channel-item__actions">
            <button
              type="button"
              className="vc-channel-item__action"
              title="Channel settings"
              aria-label={`Settings for ${ch.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onChannelSettings(ch);
              }}
            >
              <span className="vc-channel-item__action-icon vc-channel-item__action-icon--settings" />
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderServerMenu() {
    if (!serverMenuOpen || !serverMenuPos) return null;

    return (
      <div
        ref={serverMenuRef}
        className="vc-server-menu vc-server-menu--portal"
        style={{
          position: "fixed",
          top: serverMenuPos.top,
          left: serverMenuPos.left,
          width: serverMenuPos.width,
        }}
        role="menu"
      >
        {isAdmin && onOpenServerSettings && (
          <button
            type="button"
            className="vc-server-menu__item"
            role="menuitem"
            onClick={() => {
              closeMenus();
              onOpenServerSettings("overview");
            }}
          >
            <span>Server Settings</span>
            <span className="vc-server-menu__icon" aria-hidden>
              ⚙
            </span>
          </button>
        )}
        {isAdmin && onCreateChannel && (
          <>
            <button
              type="button"
              className="vc-server-menu__item"
              role="menuitem"
              onClick={() => {
                closeMenus();
                onCreateChannel(firstTextCategoryId(), "text");
              }}
            >
              <span>Create Channel</span>
              <span className="vc-server-menu__icon" aria-hidden>
                +
              </span>
            </button>
            {onCreateCategory && (
              <button
                type="button"
                className="vc-server-menu__item"
                role="menuitem"
                onClick={() => {
                  closeMenus();
                  onCreateCategory();
                }}
              >
                <span>Create Category</span>
                <span className="vc-server-menu__icon" aria-hidden>
                  📁
                </span>
              </button>
            )}
          </>
        )}
        {isAdmin && onOpenServerSettings && (
          <button
            type="button"
            className="vc-server-menu__item"
            role="menuitem"
            onClick={() => {
              closeMenus();
              onOpenServerSettings("invites");
            }}
          >
            <span>Invite to Server</span>
            <span className="vc-server-menu__icon" aria-hidden>
              ↗
            </span>
          </button>
        )}
      </div>
    );
  }

  function renderCategory(cat: ChannelCategoryInfo) {
    const isCollapsed = collapsed[cat.id];
    return (
      <div key={cat.id} className="vc-channel-category">
        <div className="vc-channel-category__header">
          <button
            type="button"
            className="vc-channel-category__toggle"
            onClick={() => toggleCategory(cat.id)}
            aria-expanded={!isCollapsed}
            aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${cat.name}`}
          >
            <span className={`vc-channel-category__chevron${isCollapsed ? " vc-channel-category__chevron--collapsed" : ""}`}>
              ▼
            </span>
            <span className="vc-channel-category__name">{cat.name.toUpperCase()}</span>
          </button>
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
        {!isCollapsed && (byCategory.get(cat.id) ?? []).map(renderChannel)}
      </div>
    );
  }

  return (
    <>
      <aside className="vc-community-sidebar">
        <div className="vc-community-sidebar__top">
          <button type="button" className="vc-community-sidebar__back" onClick={onBack}>
            {backLabel}
          </button>

          <div className="vc-server-header">
            <button
              ref={serverHeaderBtnRef}
              type="button"
              className={`vc-server-header__btn${serverMenuOpen ? " vc-server-header__btn--open" : ""}`}
              onClick={toggleServerMenu}
              aria-expanded={serverMenuOpen}
              aria-haspopup="menu"
            >
              <span className="vc-server-header__name">{communityName}</span>
              <span className="vc-server-header__chevron" aria-hidden>
                ▼
              </span>
            </button>
          </div>
        </div>

        <div className="vc-community-sidebar__channels">
          {categories.map(renderCategory)}

          {uncategorized.length > 0 && (
            <div className="vc-channel-category">
              <div className="vc-channel-category__header">
                <div className="vc-channel-category__name">CHANNELS</div>
                {isAdmin && onCreateChannel && (
                  <button
                    type="button"
                    className="vc-channel-category__add"
                    onClick={() => onCreateChannel(undefined, "text")}
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
        </div>
      </aside>

      {renderServerMenu()}

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="vc-channel-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
        >
          {isAdmin && onChannelSettings && (
            <button
              type="button"
              className="vc-channel-context-menu__item"
              role="menuitem"
              onClick={() => {
                const ch = contextMenu.channel;
                closeMenus();
                onChannelSettings(ch);
              }}
            >
              Edit Channel
            </button>
          )}
          {isAdmin && onCreateChannel && contextMenu.channel.categoryId && (
            <button
              type="button"
              className="vc-channel-context-menu__item"
              role="menuitem"
              onClick={() => {
                const ch = contextMenu.channel;
                closeMenus();
                onCreateChannel(ch.categoryId, ch.type === "voice" ? "voice" : "text");
              }}
            >
              Create {contextMenu.channel.type === "voice" ? "Voice" : "Text"} Channel
            </button>
          )}
          {isAdmin && onOpenServerSettings && (
            <button
              type="button"
              className="vc-channel-context-menu__item"
              role="menuitem"
              onClick={() => {
                closeMenus();
                onOpenServerSettings("invites");
              }}
            >
              Invite to Channel
            </button>
          )}
          {isAdmin && onChannelDelete && (
            <>
              <div className="vc-channel-context-menu__sep" />
              <button
                type="button"
                className="vc-channel-context-menu__item vc-channel-context-menu__item--danger"
                role="menuitem"
                onClick={() => {
                  const ch = contextMenu.channel;
                  closeMenus();
                  onChannelDelete(ch);
                }}
              >
                Delete Channel
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
