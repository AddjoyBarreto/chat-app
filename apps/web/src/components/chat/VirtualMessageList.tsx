"use client";

import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageBubble } from "./MessageBubble";
import type { DisplayMessage } from "@/lib/messages";
import { groupByDate } from "@/lib/messages";

type ListItem =
  | { kind: "date"; id: string; label: string }
  | { kind: "message"; id: string; message: DisplayMessage };

interface VirtualMessageListProps {
  messages: DisplayMessage[];
  authToken?: string;
  onLoadOlder?: () => void;
  loadingOlder?: boolean;
  hasMore?: boolean;
}

const START_INDEX = 100_000;

export function VirtualMessageList({
  messages,
  authToken,
  onLoadOlder,
  loadingOlder,
  hasMore,
}: VirtualMessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [firstItemIndex, setFirstItemIndex] = useState(START_INDEX);
  const prevFirstIdRef = useRef<string | undefined>(undefined);
  const prevLenRef = useRef(0);

  const items = useMemo<ListItem[]>(() => {
    const groups = groupByDate(messages);
    const flat: ListItem[] = [];
    for (const g of groups) {
      const anchorId = g.messages[0]?.id ?? g.date;
      flat.push({ kind: "date", id: `date-${anchorId}`, label: g.date });
      for (const m of g.messages) {
        flat.push({ kind: "message", id: m.id, message: m });
      }
    }
    return flat;
  }, [messages]);

  useEffect(() => {
    const firstId = messages[0]?.id;
    const len = messages.length;

    if (len === 0) {
      setFirstItemIndex(START_INDEX);
      prevFirstIdRef.current = undefined;
      prevLenRef.current = 0;
      return;
    }

    if (prevLenRef.current === 0) {
      // Fresh conversation load — stay pinned to bottom via followOutput.
      setFirstItemIndex(START_INDEX);
    } else if (len > prevLenRef.current && firstId && firstId !== prevFirstIdRef.current) {
      // Older messages prepended — shift index so scroll position stays stable.
      setFirstItemIndex((idx) => idx - (len - prevLenRef.current));
    }

    prevFirstIdRef.current = firstId;
    prevLenRef.current = len;
  }, [messages]);

  if (items.length === 0) {
    return (
      <div className="vc-empty vc-empty--conversation">
        <div className="vc-empty__icon">🔒</div>
        <p className="vc-empty__text">
          Messages are end-to-end encrypted. No one outside this chat can read them.
        </p>
      </div>
    );
  }

  return (
    <Virtuoso
      ref={virtuosoRef}
      className="vc-messages__virtuoso"
      style={{ flex: 1, minHeight: 0 }}
      data={items}
      firstItemIndex={firstItemIndex}
      initialTopMostItemIndex={items.length - 1}
      followOutput="smooth"
      atTopStateChange={(atTop) => {
        if (atTop && hasMore && onLoadOlder && !loadingOlder) onLoadOlder();
      }}
      itemContent={(index, item) => {
        if (item.kind === "date") {
          return (
            <div className="vc-date-divider">
              <span className="vc-date-divider__pill">{item.label}</span>
            </div>
          );
        }
        const localIndex = index - firstItemIndex;
        const prev = items[localIndex - 1];
        const next = items[localIndex + 1];
        const groupedWithPrev =
          prev?.kind === "message" && prev.message.from === item.message.from;
        const groupedWithNext =
          next?.kind === "message" && next.message.from === item.message.from;
        return (
          <MessageBubble
            message={item.message}
            authToken={authToken}
            groupedWithPrev={groupedWithPrev}
            groupedWithNext={groupedWithNext}
          />
        );
      }}
      components={{
        Header: () =>
          loadingOlder ? (
            <div className="vc-register__subtitle" style={{ textAlign: "center", padding: 8 }}>
              Loading older messages…
            </div>
          ) : hasMore ? (
            <div className="vc-register__subtitle" style={{ textAlign: "center", padding: 8 }}>
              Scroll up for older messages
            </div>
          ) : null,
      }}
    />
  );
}
